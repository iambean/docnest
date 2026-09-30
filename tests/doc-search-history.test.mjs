import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../server/static/js/core/doc-search.js', import.meta.url), 'utf8')

function element() {
  return {
    children: [], listeners: {}, value: '', hidden: false,
    appendChild(child) { this.children.push(child); return child },
    addEventListener(name, listener) { this.listeners[name] = listener },
    setAttribute() {}, removeAttribute() {}, focus() {},
    querySelectorAll() { return [] },
    classList: { add() {}, remove() {} },
    set textContent(value) { this.text = value; this.children = [] },
    get textContent() { return this.text || '' },
  }
}

function harness({ storage = new Map(), prefix = 'test-docs', blocked = false } = {}) {
  const timers = new Map()
  let nextTimer = 0
  const window = {
    DOCNEST_CONFIG: { storageKeyPrefix: prefix },
    localStorage: {
      getItem(key) { if (blocked) throw new Error('denied'); return storage.get(key) || null },
      setItem(key, value) { if (blocked) throw new Error('denied'); storage.set(key, value) },
    },
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer },
    clearTimeout(id) { timers.delete(id) },
  }
  const document = {
    readyState: 'loading', addEventListener() {}, body: element(),
    querySelector() { return null },
    documentElement: { getAttribute() { return null } },
    createElement: element,
    createTextNode(text) { return { textContent: text } },
  }
  vm.runInNewContext(source.replace('  function init() {', `
    window.searchTest = { state, renderResults, savePendingQuery, readHistory, closeSearch, onKeyDown };
    function init() {
  `), { window, document })
  const api = window.searchTest
  api.state.index = [{ path: 'guide.md', title: 'Guide', text: 'canonical 中文 ' + Array.from({ length: 12 }, (_, i) => `term${i}`).join(' ') }]
  api.state.modal = { input: element(), results: element(), history: element(), status: element(), overlay: element() }
  return {
    ...api, storage,
    search(query) { api.state.modal.input.value = query; api.renderResults() },
    settle() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()) },
    history() { return Array.from(api.readHistory()) },
  }
}

test('only settled matching searches persist; typing prefixes, blanks and no-result queries do not', () => {
  const h = harness()
  h.search('c'); h.search('canon'); h.search('canonical'); h.settle()
  h.search('no-matching-document'); h.settle(); h.search('   ')
  assert.deepEqual(h.history(), ['canonical'])
  assert.deepEqual(harness({ storage: h.storage }).history(), ['canonical'])
  assert.deepEqual(harness({ storage: h.storage, prefix: 'another-site' }).history(), [])
})

test('history retains ten most recent unique queries and moves reused queries to the front', () => {
  const h = harness()
  for (let i = 0; i < 12; i++) { h.search(`term${i}`); h.settle() }
  assert.deepEqual(h.history(), ['term11', 'term10', 'term9', 'term8', 'term7', 'term6', 'term5', 'term4', 'term3', 'term2'])
  h.search('  TERM5  '); h.settle()
  assert.equal(h.history()[0], 'TERM5')
  assert.equal(h.history().length, 10)
  assert.equal(h.history().filter(q => q.toLowerCase() === 'term5').length, 1)
})

test('clearing or closing immediately saves the completed query before the debounce expires', () => {
  const h = harness()
  h.search('canonical'); h.search('')
  assert.deepEqual(h.history(), ['canonical'])
  assert.equal(h.state.modal.results.hidden, true)
  assert.equal(h.state.modal.history.hidden, false)
  h.search('中文'); h.closeSearch()
  assert.deepEqual(h.history(), ['中文', 'canonical'])
})

test('IME composition is not recorded and history buttons replay searches without HTML injection', () => {
  const h = harness()
  h.state.composing = true; h.search('中'); h.settle()
  assert.deepEqual(h.history(), [])
  h.state.composing = false; h.search('中文'); h.settle(); h.search('')
  const button = h.state.modal.history.children[1].children[0]
  assert.equal(button.textContent, '中文')
  button.listeners.click()
  assert.equal(h.state.modal.input.value, '中文')
  assert.equal(h.state.results.length, 1)
  assert.equal(h.state.modal.history.hidden, true)
})

test('invalid or unavailable storage does not break search; stale entries are hidden', () => {
  for (const raw of ['{invalid', '{}', '[null,42,"","canonical","CANONICAL","missing"]']) {
    const h = harness({ storage: new Map([['test-docs:search-history', raw]]) })
    h.search('canonical'); h.settle(); h.search('')
    assert.equal(h.state.modal.history.children[1].children.length, 1)
  }
  const h = harness({ blocked: true })
  h.search('canonical'); h.settle(); h.search('')
  assert.deepEqual(h.history(), ['canonical'])
})

test('Enter on a focused history button keeps native button activation', () => {
  const h = harness()
  h.search('canonical')
  let prevented = false
  h.onKeyDown({ key: 'Enter', target: element(), preventDefault() { prevented = true } })
  assert.equal(prevented, false)
  assert.equal(h.state.modal.overlay.hidden, false)
})
