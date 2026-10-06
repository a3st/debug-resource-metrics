'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const read = path => readFileSync(resolve(__dirname, '..', path), 'utf8');
const json = path => JSON.parse(read(path));

test('all runtime strings and manifest contributions have both translations', () => {
  const runtimeKeys = [...read('src/extension.ts').matchAll(/vscode\.l10n\.t\("([^"]+)"\)/g)].map(match => match[1]);
  assert.ok(runtimeKeys.length > 20);
  const manifestKeys = [...read('package.json').matchAll(/%([^%]+)%/g)].map(match => match[1]);
  for (const locale of ['en-US', 'ru-RU', 'ru']) {
    const bundle = json(`l10n/bundle.l10n.${locale.toLowerCase()}.json`);
    const manifest = json(`package.nls.${locale.toLowerCase()}.json`);
    for (const key of runtimeKeys) {
      assert.ok(bundle[key], `${locale}: missing runtime translation: ${key}`);
      assert.deepEqual(bundle[key].match(/\{\d+\}/g), key.match(/\{\d+\}/g), `Placeholder mismatch: ${key}`);
    }
    for (const key of manifestKeys) assert.ok(manifest[key], `${locale}: missing manifest translation: ${key}`);
  }
  assert.deepEqual(json('package.nls.json'), json('package.nls.en-us.json'));
  assert.equal(json('package.json').author, 'a3st');
  assert.equal(json('package.json').publisher, 'a3st');
});
