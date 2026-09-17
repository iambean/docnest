import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const clientNavSource = await readFile(
  new URL('../server/static/js/core/doc-client-nav.js', import.meta.url),
  'utf8',
)

function createNavigationHarness({ currentPath, responsePath, responseBreadcrumbs }) {
  const article = { innerHTML: '', style: {} }
  const breadcrumbs = { innerHTML: '<ol><li>旧面包屑</li></ol>' }
  const treeNav = { querySelectorAll: () => [] }
  const listeners = new Map()
  const fetchCalls = []
  let resolvePushState

  const pushed = new Promise((resolve) => {
    resolvePushState = resolve
  })

  const body = {
    getAttribute: (name) => (name === 'data-current-path' ? currentPath : null),
    addEventListener: (name, listener) => listeners.set(name, listener),
  }
  const document = {
    readyState: 'complete',
    baseURI: 'http://127.0.0.1:3000/doc',
    body,
    querySelector: (selector) => {
      if (selector === '.main-content .markdown-body') return article
      if (selector === '.tree-nav') return treeNav
      if (selector === '.breadcrumbs') return breadcrumbs
      return null
    },
    getElementById: () => null,
  }

  class FakeDOMParser {
    parseFromString() {
      return {
        querySelector: (selector) => {
          if (selector === '.markdown-body') return { innerHTML: '<p>目标正文</p>' }
          if (selector === 'title') return { textContent: '目标文档 - DocNest' }
          if (selector === '.breadcrumbs') return { innerHTML: responseBreadcrumbs }
          return null
        },
      }
    }
  }

  const window = {
    currentDocPath: currentPath,
    location: {
      href: 'http://127.0.0.1:3000/doc',
      origin: 'http://127.0.0.1:3000',
      pathname: '/doc',
    },
    addEventListener: () => {},
    docNestEnsureAuthorized: () => Promise.resolve(true),
  }

  const context = {
    DOMParser: FakeDOMParser,
    Promise,
    URL,
    console: { log: () => {}, warn: () => {} },
    document,
    fetch: async (url) => {
      fetchCalls.push(url)
      return {
        ok: true,
        text: async () => `<html><title>目标文档 - DocNest</title><body data-current-path="${responsePath}"><div class="breadcrumbs">${responseBreadcrumbs}</div><article class="markdown-body"><p>目标正文</p></article></body></html>`,
      }
    },
    history: {
      replaceState: () => {},
      pushState: (...args) => resolvePushState(args),
    },
    setTimeout,
    clearTimeout,
    setImmediate,
    window,
  }
  window.document = document

  return { context, breadcrumbs, fetchCalls, listeners, pushed }
}

test('SPA navigation keeps server breadcrumbs for directories without README.md', async () => {
  const currentPath = '示例/有README/原始文档.md'
  const responsePath = '示例/无README/目标文档.md'
  const directoryPath = '示例/无README'
  const responseBreadcrumbs = [
    '<ol>',
    '<li class="breadcrumb-item"><a href="/" class="breadcrumb-link">首页</a></li>',
    '<li class="breadcrumb-separator" aria-hidden="true">/</li>',
    `<li class="breadcrumb-item"><a href="/dir?path=${encodeURIComponent(directoryPath)}" class="breadcrumb-link">无README</a></li>`,
    '<li class="breadcrumb-separator" aria-hidden="true">/</li>',
    '<li class="breadcrumb-item breadcrumb-current" aria-current="page">目标文档</li>',
    '</ol>',
  ].join('')
  const harness = createNavigationHarness({
    currentPath,
    responsePath,
    responseBreadcrumbs,
  })

  vm.runInNewContext(clientNavSource, harness.context, {
    filename: 'doc-client-nav.js',
  })

  const targetUrl = `/doc?path=${encodeURIComponent(responsePath)}`
  harness.context.window.navigateToDoc(targetUrl)
  await harness.pushed

  assert.equal(harness.fetchCalls[0], `http://127.0.0.1:3000${targetUrl}`)
  assert.equal(harness.breadcrumbs.innerHTML, responseBreadcrumbs)
  assert.match(harness.breadcrumbs.innerHTML, /\/dir\?path=/)
  assert.doesNotMatch(harness.breadcrumbs.innerHTML, /无README[^<]*README\.md/)
})
