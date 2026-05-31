import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from './run.ts';

test('encodes Unicode text as standard Base64', () => {
  assert.deepEqual(
    run({
      text: 'Udon工具箱',
      mode: 'encode',
      encoding: 'utf-8',
      urlSafe: false,
      wrap: false,
    }),
    {
      text: 'VWRvbuW3peWFt+eusQ==',
      inputBytes: 13,
      outputCharacters: 20,
      mode: 'encode',
    },
  );
});

test('decodes URL-safe Base64 without padding', () => {
  assert.deepEqual(
    run({
      text: 'Pz8',
      mode: 'decode',
      encoding: 'utf-8',
      urlSafe: true,
      wrap: false,
    }),
    {
      text: '??',
      inputBytes: 3,
      outputCharacters: 2,
      mode: 'decode',
    },
  );
});

test('wraps encoded output at 76 characters', () => {
  const result = run({
    text: 'a'.repeat(60),
    mode: 'encode',
    encoding: 'utf-8',
    urlSafe: false,
    wrap: true,
  });

  assert.equal(result.text, `${'YWFh'.repeat(19)}\nYWFh`);
  assert.equal(result.inputBytes, 60);
  assert.equal(result.outputCharacters, 81);
});

test('rejects invalid Base64 while decoding', () => {
  assert.throws(
    () =>
      run({
        text: 'not base64!',
        mode: 'decode',
        encoding: 'utf-8',
        urlSafe: false,
        wrap: false,
      }),
    /Invalid Base64 input/,
  );
});
