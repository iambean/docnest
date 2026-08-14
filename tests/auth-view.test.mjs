import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const server = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8')
const header = await readFile(
  new URL('../server/views/partials/header.ejs', import.meta.url),
  'utf8',
)
const login = await readFile(new URL('../server/views/login.ejs', import.meta.url), 'utf8')
const authScript = await readFile(
  new URL('../server/static/js/core/auth.js', import.meta.url),
  'utf8',
)

test('single-passphrase authorization protects documents while leaving health checks public', () => {
  assert.match(server, /app\.use\(documentAuthMiddleware\)/)
  assert.match(server, /req\.path === '\/health' \|\| req\.path === '\/ready'/)
  assert.match(server, /app\.post\('\/auth\/login'/)
  assert.match(server, /app\.post\('\/auth\/change-password'/)
  assert.match(server, /io\.use\(\(socket, next\) =>/)
})

test('authenticated pages expose change-password and logout controls without role concepts', () => {
  assert.match(header, /docsAuthEnabled/)
  assert.match(header, /id="auth-change-password-btn"/)
  assert.match(header, /action="\/auth\/logout" method="post"/)
  assert.match(header, /id="auth-change-password-form"/)
  assert.doesNotMatch(header, /name="(?:username|role|account)"/i)
  assert.match(authScript, /\/auth\/change-password/)
})

test('login page accepts only one passphrase and preserves a safe next path', () => {
  assert.match(login, /action="\/auth\/login" method="post"/)
  assert.match(login, /name="passphrase"/)
  assert.match(login, /name="next"/)
  assert.doesNotMatch(login, /name="(?:username|role|account|email)"/i)
})
