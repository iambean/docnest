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
  assert.equal(config.export.watermark.enabled, false)
})

test('loads project-local branding, root order, server and watermark config', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'docnest-config-'))
  await mkdir(path.join(projectRoot, 'docs'))
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'demo-project' }))
  await writeFile(
    path.join(projectRoot, 'docnest.config.mjs'),
    `export default {
      docsDir: 'docs-center/docs',
      site: { title: '项目文档', storageKeyPrefix: 'project-docs' },
      navigation: { rootDirectoryOrder: ['architecture', '@temp'] },
      server: { port: 3130, openBrowser: false },
      export: { watermark: { enabled: true, text: '单次导出水印' } },
    }`,
  )

  const config = await loadConfig(projectRoot)

  assert.equal(config.docsDir, path.join(projectRoot, 'docs-center/docs'))
  assert.equal(config.site.title, '项目文档')
  assert.deepEqual(config.navigation.rootDirectoryOrder, ['architecture', '@temp'])
  assert.equal(config.server.port, 3130)
  assert.equal(config.server.openBrowser, false)
  assert.deepEqual(config.export.watermark, { enabled: true, text: '单次导出水印' })
})
