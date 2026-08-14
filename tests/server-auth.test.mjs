import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const cliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url))

async function findFreePort() {
  const listener = net.createServer()
  await new Promise((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', resolve)
  })
  const address = listener.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()))
  })
  return port
}

async function waitForReady(port) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ready`)
      if (response.ok) return
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('授权测试服务器启动超时')
}

function sessionCookie(response) {
  const value = response.headers.get('set-cookie') || ''
  return value.split(';', 1)[0]
}

async function request(port, requestPath, init = {}) {
  return fetch(`http://127.0.0.1:${port}${requestPath}`, {
    redirect: 'manual',
    ...init,
  })
}

test('configured single-passphrase auth protects documents and supports runtime rotation', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docnest-server-auth-'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'auth-fixture' }))
  await writeFile(path.join(root, 'docnest.config.mjs'), `export default {
    docsDir: 'docs',
    auth: {
      enabled: true,
      passphrase: '旧口令',
      stateFile: '.docnest/auth.json',
      sessionTtlMinutes: 60,
    },
    server: { openBrowser: false },
  }`)
  await mkdir(path.join(root, 'docs'))
  await writeFile(path.join(root, 'docs', 'README.md'), '# 受保护文档\n')

  const port = await findFreePort()
  const child = spawn(process.execPath, [cliPath, 'serve', '--no-open', '--port', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (child.exitCode !== null) return
    child.kill('SIGTERM')
    await once(child, 'exit').catch(() => undefined)
  })

  await waitForReady(port)

  const health = await request(port, '/health')
  assert.equal(health.status, 200)
  assert.equal((await health.json()).authEnabled, true)

  const anonymousHome = await request(port, '/')
  assert.equal(anonymousHome.status, 302)
  assert.match(anonymousHome.headers.get('location') || '', /^\/login\?next=/)

  const loginPage = await request(port, '/login')
  assert.equal(loginPage.status, 200)
  assert.match(await loginPage.text(), /授权口令/)

  const wrongVerify = await request(port, '/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ passphrase: '错误口令' }),
  })
  assert.equal(wrongVerify.status, 401)
  assert.deepEqual(await wrongVerify.json(), { ok: false, error: '口令不正确，请重试。' })

  const login = await request(port, '/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ passphrase: '旧口令' }),
  })
  assert.equal(login.status, 200)
  assert.deepEqual(await login.json(), { ok: true })
  const oldCookie = sessionCookie(login)
  assert.match(oldCookie, /^docnest_session=/)

  const authorizedHome = await request(port, '/', { headers: { cookie: oldCookie } })
  assert.equal(authorizedHome.status, 200)
  assert.match(await authorizedHome.text(), /欢迎使用文档中心/)

  const changed = await request(port, '/auth/change-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: oldCookie },
    body: JSON.stringify({ currentPassphrase: '旧口令', nextPassphrase: '新口令' }),
  })
  assert.equal(changed.status, 200)
  assert.deepEqual(await changed.json(), { ok: true })

  const oldSession = await request(port, '/', { headers: { cookie: oldCookie } })
  assert.equal(oldSession.status, 302)

  const oldLogin = await request(port, '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ passphrase: '旧口令', next: '/' }),
  })
  assert.equal(oldLogin.status, 401)

  const newLogin = await request(port, '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ passphrase: '新口令', next: '/' }),
  })
  assert.equal(newLogin.status, 302)
  const newCookie = sessionCookie(newLogin)
  const authorizedDoc = await request(port, '/doc?path=README.md', {
    headers: { cookie: newCookie },
  })
  assert.equal(authorizedDoc.status, 200)
  assert.match(await authorizedDoc.text(), /受保护文档/)

  const state = await readFile(path.join(root, '.docnest', 'auth.json'), 'utf8')
  assert.doesNotMatch(state, /旧口令|新口令/)
})
