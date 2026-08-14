import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
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
  throw new Error('PDF 导出测试服务器启动超时')
}

test('normal mode restores export UI and Mermaid viewer assets', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docnest-server-pdf-'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'pdf-fixture' }))
  await writeFile(path.join(root, 'docnest.config.mjs'), `export default {
    docsDir: 'docs',
    server: { openBrowser: false },
    restrictedMode: false,
  }`)
  await mkdir(path.join(root, 'docs'))
  await writeFile(path.join(root, 'docs', 'README.md'), '# 可导出文档\n')
  await mkdir(path.join(root, 'docs', '示例', '进阶'), { recursive: true })
  await writeFile(path.join(root, 'docs', '示例', 'README.md'), '# 示例目录\n')
  await writeFile(path.join(root, 'docs', '示例', '进阶', 'README.md'), '# 进阶目录\n')

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
  const response = await fetch(`http://127.0.0.1:${port}/doc?path=README.md`)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /id="print-doc-btn"/)
  assert.match(html, /id="download-doc-pdf-btn"/)
  assert.match(html, /doc-pdf-export\.js/)
  assert.match(html, /diagram-viewer\.js/)
  assert.match(html, /diagram-download\.js/)
  assert.doesNotMatch(html, /docnest-page-watermark/)
  assert.doesNotMatch(html, /docnest-page-protected/)

  const index = await fetch(`http://127.0.0.1:${port}/`)
  assert.equal(index.status, 200)
  assert.match(await index.text(), /tree-readme-badge/)

  const nestedDirectory = await fetch(
    `http://127.0.0.1:${port}/dir?path=${encodeURIComponent('示例/进阶')}`,
    { redirect: 'manual' },
  )
  assert.equal(nestedDirectory.status, 302)
  assert.equal(
    nestedDirectory.headers.get('location'),
    `/doc?path=${encodeURIComponent('示例/进阶/README.md')}`,
  )
})
