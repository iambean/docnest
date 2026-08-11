import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('CLI bin is executable by npm and npx', async () => {
  const cli = await readFile(new URL('../src/cli.ts', import.meta.url), 'utf8')
  assert.match(cli, /^#!\/usr\/bin\/env node\n/)
})
