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

test('moved documents retain old links only when the filename is unique within the original directory', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docnest-moved-docs-'))
  await writeFile(path.join(root, 'docnest.config.mjs'), 'export default { docsDir: "docs", server: { openBrowser: false } }')
  for (const name of ['开发者文档/运维手册/运行诊断.md', '客户文档/运行诊断.md', '开发者文档/归档甲/同名.md', '开发者文档/归档乙/同名.md']) {
    await mkdir(path.dirname(path.join(root, 'docs', name)), { recursive: true })
    await writeFile(path.join(root, 'docs', name), '# ' + name + '\n')
  }
  const port = await findFreePort()
  const child = spawn(process.execPath, [cliPath, 'serve', '--no-open', '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(async () => {
    if (child.exitCode !== null) return
    child.kill('SIGTERM')
    await once(child, 'exit').catch(() => undefined)
  })
  await waitForReady(port)
  const request = (name) => fetch(`http://127.0.0.1:${port}/doc?path=${encodeURIComponent(name)}`, { redirect: 'manual' })
  const moved = await request('开发者文档/运行诊断.md')
  assert.equal(moved.status, 302)
  assert.equal(moved.headers.get('location'), `/doc?path=${encodeURIComponent('开发者文档/运维手册/运行诊断.md')}`)
  assert.equal((await request('开发者文档/运维手册/运行诊断.md')).status, 200)
  assert.equal((await request('开发者文档/同名.md')).status, 404)
  assert.equal((await request('运行诊断.md')).status, 404)
  assert.equal((await request('不存在的目录/运行诊断.md')).status, 404)
  assert.equal((await request('开发者文档/归档甲/同名.md')).status, 200)
})

test('Mermaid fences keep diagram typography and literal HTML labels outside code blocks', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docnest-mermaid-labels-'))
  await mkdir(path.join(root, 'docs'))
  await writeFile(path.join(root, 'docnest.config.mjs'), 'export default { docsDir: "docs", server: { openBrowser: false } }')
  const source = 'flowchart TD\n  A["push master 或 release"] -- "仅 DocNest 变化" --> B["GitHub-hosted<br/>源码检查与测试"]\n'
  await writeFile(path.join(root, 'docs', 'README.md'), '# 图表\n\n```mermaid\n' + source + '```\n\n```text\nordinary <code>\n```\n')
  const port = await findFreePort()
  const child = spawn(process.execPath, [cliPath, 'serve', '--no-open', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, DOCS_ALLOW_RAW_HTML: 'false' },
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
  assert.doesNotMatch(html, /<pre[^>]*>\s*<code[^>]*>\s*<div class="mermaid">/,
    'a code ancestor changes label fonts after Mermaid measures them')
  assert.match(html, /<div class="mermaid">flowchart TD[\s\S]*?GitHub-hosted&lt;br\/&gt;源码检查与测试/,
    'HTML labels must reach Mermaid as source text, not pre-parsed DOM')
  assert.match(html, /<pre class="hljs"><code[^>]*>ordinary &lt;code&gt;/)
})

test('normal mode restores export UI and Mermaid viewer assets', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docnest-server-pdf-'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'pdf-fixture' }))
  await writeFile(path.join(root, 'docnest.config.mjs'), `export default {
    docsDir: 'docs',
    server: { openBrowser: false },
    restrictedMode: false,
  }`)
  await mkdir(path.join(root, 'docs'))
  await writeFile(
    path.join(root, 'docs', 'README.md'),
    '# 可导出文档\n\n这是 **可搜索正文**，详见 [文档链接](./README.md)。\n',
  )
  await mkdir(path.join(root, 'docs', '示例', '进阶'), { recursive: true })
  await writeFile(path.join(root, 'docs', '示例', 'README.md'), '# 示例目录\n')
  await writeFile(path.join(root, 'docs', '示例', '进阶', 'README.md'), '# 进阶目录\n')
  await mkdir(path.join(root, 'docs', '示例', '无README'), { recursive: true })
  await writeFile(path.join(root, 'docs', '示例', '无README', '文档.md'), '# 无 README 的文档\n')

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
  assert.match(html, /id="doc-search-trigger"/)
  assert.match(html, /doc-search\.js/)
  assert.match(html, /id="print-doc-btn"/)
  assert.match(html, /id="download-doc-pdf-btn"/)
  assert.match(html, /doc-pdf-export\.js/)
  assert.match(html, /diagram-viewer\.js/)
  assert.match(html, /diagram-download\.js/)
  assert.doesNotMatch(html, /docnest-page-watermark/)
  assert.doesNotMatch(html, /docnest-page-protected/)
  assert.doesNotMatch(html, /data-docnest-static="true"/)

  const searchIndex = await fetch(`http://127.0.0.1:${port}/search-index.json`, {
    headers: { accept: 'application/json' },
  })
  assert.equal(searchIndex.status, 200)
  const searchPayload = await searchIndex.json()
  assert.equal(searchPayload.version, 1)
  assert.deepEqual(
    searchPayload.documents.map((document) => document.path),
    ['README.md', '示例/README.md', '示例/进阶/README.md', '示例/无README/文档.md'],
  )
  assert.equal(searchPayload.documents[0].title, '可导出文档')
  assert.deepEqual(searchPayload.documents[0].headings, ['可导出文档'])
  assert.match(searchPayload.documents[0].text, /可导出文档.*可搜索正文.*文档链接/)
  assert.doesNotMatch(searchPayload.documents[0].text, /\*\*|README\.md/)

  await writeFile(path.join(root, 'docs', 'README.md'), '# 可导出文档\n\n搜索缓存失效校验\n')
  let refreshedIndex = null
  const refreshDeadline = Date.now() + 5_000
  while (Date.now() < refreshDeadline) {
    const refreshedResponse = await fetch(`http://127.0.0.1:${port}/search-index.json`, {
      headers: { accept: 'application/json' },
    })
    const candidate = await refreshedResponse.json()
    if (candidate.documents?.[0]?.text?.includes('搜索缓存失效校验')) {
      refreshedIndex = candidate
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(refreshedIndex, 'Markdown changes should invalidate the cached search index')

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

  const documentWithoutReadme = await fetch(
    `http://127.0.0.1:${port}/doc?path=${encodeURIComponent('示例/无README/文档.md')}`,
  )
  assert.equal(documentWithoutReadme.status, 200)
  const documentWithoutReadmeHtml = await documentWithoutReadme.text()
  assert.ok(
    documentWithoutReadmeHtml.includes(
      `/dir?path=${encodeURIComponent('示例/无README')}`,
    ),
    'document breadcrumbs should link to the directory listing when README.md is absent',
  )
  assert.doesNotMatch(
    documentWithoutReadmeHtml,
    new RegExp(`/doc\\?path=${encodeURIComponent('示例/无README/README.md')}`),
  )

  const directoryWithoutReadme = await fetch(
    `http://127.0.0.1:${port}/dir?path=${encodeURIComponent('示例/无README')}`,
  )
  assert.equal(directoryWithoutReadme.status, 200)
  assert.match(await directoryWithoutReadme.text(), /文档\.md/)
})
