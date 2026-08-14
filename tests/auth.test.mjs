import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createAuthManager } from '../dist/auth.js'

function createConfig(stateFile, passphrase = '') {
  return {
    enabled: true,
    passphrase,
    stateFile,
    sessionTtlMinutes: 60,
  }
}

test('disabled authorization keeps the manager open without creating state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docnest-auth-disabled-'))
  const stateFile = path.join(root, '.docnest', 'auth.json')
  const manager = createAuthManager({ ...createConfig(stateFile), enabled: false })

  assert.equal(manager.enabled, false)
  assert.equal(manager.createSession('anything'), null)
  assert.equal(manager.authenticateSession(undefined), true)
  await assert.rejects(stat(stateFile), { code: 'ENOENT' })
})

test('initial passphrase is hashed and creates an authenticated session', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docnest-auth-bootstrap-'))
  const stateFile = path.join(root, '.docnest', 'auth.json')
  const manager = createAuthManager(createConfig(stateFile, '第一道口令'))
  const token = manager.createSession('第一道口令')

  assert.equal(manager.verifyPassphrase('错误口令'), false)
  assert.equal(typeof token, 'string')
  assert.equal(manager.authenticateSession(token || undefined), true)
  assert.equal(manager.authenticateSession('not-a-session'), false)

  const raw = await readFile(stateFile, 'utf8')
  assert.doesNotMatch(raw, /第一道口令/)
  const state = JSON.parse(raw)
  assert.equal(state.version, 1)
  assert.equal(typeof state.salt, 'string')
  assert.equal(typeof state.hash, 'string')
  const permissions = (await stat(stateFile)).mode & 0o777
  assert.equal(permissions, 0o600)
})

test('changing the passphrase persists it and invalidates every existing session', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docnest-auth-change-'))
  const stateFile = path.join(root, '.docnest', 'auth.json')
  const manager = createAuthManager(createConfig(stateFile, '旧口令'))
  const oldToken = manager.createSession('旧口令')

  assert.equal(manager.changePassphrase('错误口令', '新口令'), false)
  assert.equal(manager.changePassphrase('旧口令', '新口令'), true)
  assert.equal(manager.authenticateSession(oldToken || undefined), false)
  assert.equal(manager.createSession('旧口令'), null)

  const restartedManager = createAuthManager(createConfig(stateFile))
  assert.equal(restartedManager.createSession('旧口令'), null)
  assert.equal(typeof restartedManager.createSession('新口令'), 'string')
})

test('enabled authorization refuses to start without an initial passphrase or state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docnest-auth-missing-'))
  const stateFile = path.join(root, '.docnest', 'auth.json')

  assert.throws(
    () => createAuthManager(createConfig(stateFile)),
    /未配置初始口令/,
  )
})
