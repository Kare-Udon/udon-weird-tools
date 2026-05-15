import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { copyTextToClipboard } from './clipboard.ts';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

afterEach(() => {
  restoreGlobal('navigator', originalNavigator);
  restoreGlobal('document', originalDocument);
});

test('copies with the Clipboard API when available', async () => {
  let copied = '';
  setGlobal('navigator', {
    clipboard: {
      writeText: async (text) => {
        copied = text;
      },
    },
  });

  assert.equal(await copyTextToClipboard('  hello  '), true);
  assert.equal(copied, 'hello');
});

test('falls back to textarea copy when Clipboard API fails', async () => {
  let copiedValue = '';
  const textarea = {
    value: '',
    style: {},
    setAttribute() {},
    focus() {},
    select() {},
    setSelectionRange() {},
    remove() {},
  };

  setGlobal('navigator', {
    clipboard: {
      writeText: async () => {
        throw new Error('denied');
      },
    },
  });
  setGlobal('document', {
    body: {
      append() {},
    },
    createElement() {
      return textarea;
    },
    execCommand(command) {
      copiedValue = textarea.value;
      return command === 'copy';
    },
  });

  assert.equal(await copyTextToClipboard(' fallback '), true);
  assert.equal(copiedValue, 'fallback');
});

test('reports failure when no copy path is available', async () => {
  setGlobal('navigator', {});
  setGlobal('document', {});

  assert.equal(await copyTextToClipboard('hello'), false);
});

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
  });
}

function restoreGlobal(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    delete globalThis[name];
  }
}
