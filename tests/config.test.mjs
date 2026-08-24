import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { loadConfig } from '../dist/config.js'

test('defaults to project docs and derives a neutral site identity', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'docnest-config-'))
  await mkdir(path.join(projectRoot, 'docs'))
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'demo-project' }))

  const config = await loadConfig(projectRoot)

  assert.equal(config.docsDir, path.join(projectRoot, 'docs'))
  assert.equal(config.site.title, 'demo-project')
  assert.equal(config.site.storageKeyPrefix, 'docnest:demo-project')
  assert.equal(config.server.host, '127.0.0.1')
  assert.equal(config.server.port, 3000)
  assert.equal(config.appearance.defaultTheme, 'slate-modern')
  assert.equal(config.appearance.defaultMode, 'auto')
  assert.deepEqual(config.appearance.enabledThemes, [
    'slate-modern',
    'editorial-atlas',
    'precision-index',
    'archive-room',
    'swiss-manual',
  ])
  assert.equal(config.auth.enabled, false)
  assert.equal(config.auth.redirectPrefix, '')
  assert.equal(config.auth.stateFile, path.join(projectRoot, '.docnest/auth.json'))
  assert.equal(config.auth.localStorageKey, 'docnest:demo-project:auth-passphrase')
  assert.equal(config.auth.sessionTtlMinutes, 24 * 60)
  assert.equal(config.restrictedMode, false)
})

test('normalizes the legacy current-docs theme name to Slate Modern', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'docnest-config-'))
  await mkdir(path.join(projectRoot, 'docs'))
  await writeFile(
    path.join(projectRoot, 'docnest.config.mjs'),
    `export default { appearance: { defaultTheme: 'current-docs', enabledThemes: ['current-docs', 'archive-room'] } }`,
  )

  const config = await loadConfig(projectRoot)

  assert.equal(config.appearance.defaultTheme, 'slate-modern')
  assert.deepEqual(config.appearance.enabledThemes, ['slate-modern', 'archive-room'])
})

test('loads project-local branding, root order, server and reading policy config', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'docnest-config-'))
  await mkdir(path.join(projectRoot, 'docs'))
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'demo-project' }))
  await writeFile(
    path.join(projectRoot, 'docnest.config.mjs'),
    `export default {
      docsDir: 'docs-center/docs',
      site: { title: '项目文档', storageKeyPrefix: 'project-docs' },
      navigation: { rootDirectoryOrder: ['architecture', '@temp'] },
      appearance: {
        defaultTheme: 'archive-room',
        defaultMode: 'dark',
        enabledThemes: ['archive-room', 'swiss-manual', 'archive-room'],
      },
      server: { port: 3130, openBrowser: false },
      auth: {
        enabled: true,
        passphrase: '初始口令',
        redirectPrefix: '/documents/',
        stateFile: '.runtime/docnest-auth.json',
        localStorageKey: 'project-auth-passphrase',
        sessionTtlMinutes: 90,
      },
      restrictedMode: true,
    }`,
  )

  const config = await loadConfig(projectRoot)

  assert.equal(config.docsDir, path.join(projectRoot, 'docs-center/docs'))
  assert.equal(config.site.title, '项目文档')
  assert.deepEqual(config.navigation.rootDirectoryOrder, ['architecture', '@temp'])
  assert.equal(config.server.port, 3130)
  assert.equal(config.server.openBrowser, false)
  assert.deepEqual(config.auth, {
    enabled: true,
    passphrase: '初始口令',
    redirectPrefix: '/documents',
    stateFile: path.join(projectRoot, '.runtime/docnest-auth.json'),
    localStorageKey: 'project-auth-passphrase',
    sessionTtlMinutes: 90,
  })
  assert.deepEqual(config.appearance, {
    defaultTheme: 'archive-room',
    defaultMode: 'dark',
    enabledThemes: ['archive-room', 'swiss-manual'],
  })
  assert.equal(config.restrictedMode, true)
})
