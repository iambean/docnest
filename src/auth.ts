import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const AUTH_STATE_VERSION = 1
const HASH_LENGTH = 32
const SALT_LENGTH = 16
const MAX_PASSPHRASE_LENGTH = 1024
const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 } as const

type AuthState = {
  version: typeof AUTH_STATE_VERSION
  salt: string
  hash: string
}

export type DocNestAuthConfig = {
  enabled: boolean
  passphrase: string
  stateFile: string
  sessionTtlMinutes: number
}

export type DocNestAuthManager = {
  enabled: boolean
  stateFile: string
  sessionCookieName: string
  sessionMaxAgeSeconds: number
  verifyPassphrase: (passphrase: string) => boolean
  createSession: (passphrase: string) => string | null
  authenticateSession: (token: string | undefined) => boolean
  revokeSession: (token: string | undefined) => void
  changePassphrase: (currentPassphrase: string, nextPassphrase: string) => boolean
}

type Session = {
  expiresAt: number
}

function assertPassphrase(passphrase: string, label: string): void {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error(`${label}不能为空`)
  }
  if (passphrase.length > MAX_PASSPHRASE_LENGTH) {
    throw new Error(`${label}长度不能超过 ${MAX_PASSPHRASE_LENGTH} 个字符`)
  }
}

function hashPassphrase(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, HASH_LENGTH, SCRYPT_OPTIONS)
}

function createState(passphrase: string): AuthState {
  assertPassphrase(passphrase, '授权口令')
  const salt = crypto.randomBytes(SALT_LENGTH)
  return {
    version: AUTH_STATE_VERSION,
    salt: salt.toString('base64url'),
    hash: hashPassphrase(passphrase, salt).toString('base64url'),
  }
}

function parseState(raw: string, stateFile: string): AuthState {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`授权状态文件无法解析：${stateFile}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`授权状态文件格式无效：${stateFile}`)
  }

  const state = parsed as Partial<AuthState>
  if (
    state.version !== AUTH_STATE_VERSION ||
    typeof state.salt !== 'string' ||
    typeof state.hash !== 'string'
  ) {
    throw new Error(`授权状态文件格式无效：${stateFile}`)
  }

  let salt: Buffer
  let hash: Buffer
  try {
    salt = Buffer.from(state.salt, 'base64url')
    hash = Buffer.from(state.hash, 'base64url')
  } catch {
    throw new Error(`授权状态文件格式无效：${stateFile}`)
  }
  if (salt.length !== SALT_LENGTH || hash.length !== HASH_LENGTH) {
    throw new Error(`授权状态文件格式无效：${stateFile}`)
  }

  return {
    version: AUTH_STATE_VERSION,
    salt: salt.toString('base64url'),
    hash: hash.toString('base64url'),
  }
}

function readOrCreateState(config: DocNestAuthConfig): AuthState {
  try {
    return parseState(fs.readFileSync(config.stateFile, 'utf8'), config.stateFile)
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
  }

  if (!config.passphrase) {
    throw new Error(
      `授权已启用，但未配置初始口令，也找不到授权状态文件：${config.stateFile}`,
    )
  }

  const state = createState(config.passphrase)
  writeState(config.stateFile, state)
  return state
}

function writeState(stateFile: string, state: AuthState): void {
  const directory = path.dirname(stateFile)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })

  const temporaryFile = `${stateFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify(state)}\n`, { mode: 0o600 })
    fs.chmodSync(temporaryFile, 0o600)
    fs.renameSync(temporaryFile, stateFile)
    fs.chmodSync(stateFile, 0o600)
  } finally {
    try {
      fs.unlinkSync(temporaryFile)
    } catch {
      // The temporary file was renamed successfully, or cleanup is unnecessary.
    }
  }
}

function matchesHash(passphrase: string, state: AuthState): boolean {
  if (typeof passphrase !== 'string' || passphrase.length > MAX_PASSPHRASE_LENGTH) return false
  const salt = Buffer.from(state.salt, 'base64url')
  const expected = Buffer.from(state.hash, 'base64url')
  const actual = hashPassphrase(passphrase, salt)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

function normalizeSessionTtl(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return DEFAULT_SESSION_TTL_SECONDS
  return Math.max(5 * 60, Math.min(Math.floor(minutes * 60), 30 * 24 * 60 * 60))
}

export function createAuthManager(config: DocNestAuthConfig): DocNestAuthManager {
  const enabled = config.enabled === true
  const sessionMaxAgeSeconds = normalizeSessionTtl(config.sessionTtlMinutes)
  const sessionCookieName = 'docnest_session'
  const sessions = new Map<string, Session>()

  if (!enabled) {
    return {
      enabled: false,
      stateFile: config.stateFile,
      sessionCookieName,
      sessionMaxAgeSeconds,
      verifyPassphrase: () => true,
      createSession: () => null,
      authenticateSession: () => true,
      revokeSession: () => undefined,
      changePassphrase: () => false,
    }
  }

  let state = readOrCreateState(config)

  function verifyPassphrase(passphrase: string): boolean {
    return matchesHash(passphrase, state)
  }

  function purgeExpiredSessions(): void {
    const now = Date.now()
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token)
    }
  }

  function createSession(passphrase: string): string | null {
    if (!verifyPassphrase(passphrase)) return null
    purgeExpiredSessions()
    const token = crypto.randomBytes(32).toString('base64url')
    sessions.set(token, { expiresAt: Date.now() + sessionMaxAgeSeconds * 1000 })
    return token
  }

  function authenticateSession(token: string | undefined): boolean {
    if (!token) return false
    purgeExpiredSessions()
    const session = sessions.get(token)
    if (!session) return false
    session.expiresAt = Date.now() + sessionMaxAgeSeconds * 1000
    return true
  }

  function revokeSession(token: string | undefined): void {
    if (token) sessions.delete(token)
  }

  function changePassphrase(currentPassphrase: string, nextPassphrase: string): boolean {
    if (!verifyPassphrase(currentPassphrase)) return false
    assertPassphrase(nextPassphrase, '新授权口令')
    state = createState(nextPassphrase)
    writeState(config.stateFile, state)
    sessions.clear()
    return true
  }

  return {
    enabled,
    stateFile: config.stateFile,
    sessionCookieName,
    sessionMaxAgeSeconds,
    verifyPassphrase,
    createSession,
    authenticateSession,
    revokeSession,
    changePassphrase,
  }
}
