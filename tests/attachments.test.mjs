import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  collectDocumentAttachmentPaths,
  copyDocumentAttachments,
  rewriteDocumentAttachmentUrls,
} from '../dist/attachments.js'

test('collects referenced local attachments without an extension allowlist', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'docnest-attachments-'))
  const docs = path.join(root, 'docs')
  const output = path.join(root, 'build', 'doc-asset')
  mkdirSync(path.join(docs, 'guide'), { recursive: true })
  mkdirSync(path.join(docs, '.private'), { recursive: true })

  try {
    writeFileSync(path.join(docs, 'guide', 'report.md'), [
      '# Report',
      '[SQL audit](./audit.sql)',
      '![diagram](./diagram.svg?download=1#top)',
      '<a href="./data.csv">CSV</a>',
      '<img src="./image.webp">',
      '[referenced archive][archive]',
      '[archive]: <./archive.zip> "download"',
      '[external](https://example.com/file.zip)',
      '[document](./appendix.md)',
      '[credentials](./local.env)',
      '```md',
      '[not-an-asset](./ignored.zip)',
      '```',
    ].join('\n'))
    writeFileSync(path.join(docs, 'guide', 'audit.sql'), 'SELECT 1;\n')
    writeFileSync(path.join(docs, 'guide', 'diagram.svg'), '<svg />\n')
    writeFileSync(path.join(docs, 'guide', 'data.csv'), 'id\n1\n')
    writeFileSync(path.join(docs, 'guide', 'image.webp'), 'binary\n')
    writeFileSync(path.join(docs, 'guide', 'archive.zip'), 'binary\n')
    writeFileSync(path.join(docs, 'guide', 'ignored.zip'), 'binary\n')
    writeFileSync(path.join(docs, 'guide', 'local.env'), 'SECRET=value\n')
    writeFileSync(path.join(docs, '.private', 'secret.txt'), 'secret\n')

    assert.deepEqual(collectDocumentAttachmentPaths(docs), [
      'guide/archive.zip',
      'guide/audit.sql',
      'guide/data.csv',
      'guide/diagram.svg',
      'guide/image.webp',
    ])

    assert.deepEqual(copyDocumentAttachments(docs, output), [
      'guide/archive.zip',
      'guide/audit.sql',
      'guide/data.csv',
      'guide/diagram.svg',
      'guide/image.webp',
    ])
    assert.equal(readFileSync(path.join(output, 'guide', 'audit.sql'), 'utf8'), 'SELECT 1;\n')
    assert.equal(existsSync(path.join(output, 'guide', 'ignored.zip')), false)
    assert.equal(existsSync(path.join(output, '.private', 'secret.txt')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects missing referenced non-document attachments', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'docnest-missing-attachment-'))
  const docs = path.join(root, 'docs')
  mkdirSync(docs)

  try {
    writeFileSync(path.join(docs, 'report.md'), '[missing](./missing.csv)\n')
    assert.throws(
      () => collectDocumentAttachmentPaths(docs),
      /文档附件不存在: report\.md -> \.\/missing\.csv/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('skips missing document links and paths outside the document root', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'docnest-document-links-'))
  const docs = path.join(root, 'docs')
  mkdirSync(docs)

  try {
    writeFileSync(path.join(docs, 'report.md'), [
      '[missing document](./missing.md)',
      '[source file](../../outside.ts)',
      '[anchor](#section)',
    ].join('\n'))
    assert.deepEqual(collectDocumentAttachmentPaths(docs), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rewrites only collected local attachment URLs for static output', () => {
  const html = [
    '<a href="./audit.sql?download=1">SQL</a>',
    '<img src="./diagram.svg#top">',
    '<a href="./appendix.md">Document</a>',
    '<a href="https://example.com/file.zip">External</a>',
    '<img src="/static/img/docs/image.png">',
  ].join('')

  assert.equal(
    rewriteDocumentAttachmentUrls(html, 'guide/report.md', {
      assetPaths: ['guide/audit.sql', 'guide/diagram.svg'],
    }),
    [
      '<a href="/doc-asset/guide/audit.sql?download=1">SQL</a>',
      '<img src="/doc-asset/guide/diagram.svg#top">',
      '<a href="./appendix.md">Document</a>',
      '<a href="https://example.com/file.zip">External</a>',
      '<img src="/static/img/docs/image.png">',
    ].join(''),
  )
})
