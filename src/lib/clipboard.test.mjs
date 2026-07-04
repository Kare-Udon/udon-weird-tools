import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import * as clipboard from './clipboard.ts';

const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;

afterEach(() => {
  setGlobal('document', originalDocument);
  setGlobal('navigator', originalNavigator);
});

test('copies exact text with textarea fallback before using Clipboard API', async () => {
  let copiedValue = '';
  let writeTextCalled = false;
  const fakeTextarea = {
    value: '',
    style: {},
    setAttribute() {},
    focus() {},
    select() {},
    setSelectionRange() {},
    remove() {},
  };

  setGlobal('document', {
    body: {
      append() {},
    },
    createElement(tagName) {
      assert.equal(tagName, 'textarea');
      return fakeTextarea;
    },
    execCommand(command) {
      assert.equal(command, 'copy');
      copiedValue = fakeTextarea.value;
      return true;
    },
  });
  setGlobal('navigator', {
    clipboard: {
      async writeText() {
        writeTextCalled = true;
      },
    },
  });

  const copied = await clipboard.copyTextToClipboard('aGVsbG8=\\n');

  assert.equal(copied, true);
  assert.equal(copiedValue, 'aGVsbG8=\\n');
  assert.equal(writeTextCalled, false);
});

test('falls back to Clipboard API when textarea copy fails', async () => {
  let copiedValue = '';

  setGlobal('document', {
    body: {
      append() {},
    },
    createElement() {
      return {
        value: '',
        style: {},
        setAttribute() {},
        focus() {},
        select() {},
        setSelectionRange() {},
        remove() {},
      };
    },
    execCommand() {
      return false;
    },
  });
  setGlobal('navigator', {
    clipboard: {
      async writeText(value) {
        copiedValue = value;
      },
    },
  });

  const copied = await clipboard.copyTextToClipboard('aGVsbG8=');

  assert.equal(copied, true);
  assert.equal(copiedValue, 'aGVsbG8=');
});

test('reports failure when no copy mechanism works', async () => {
  setGlobal('document', undefined);
  setGlobal('navigator', {});

  assert.equal(await clipboard.copyTextToClipboard('aGVsbG8='), false);
});

test('reads exact text from Clipboard API', async () => {
  setGlobal('navigator', {
    clipboard: {
      async readText() {
        return 'aGVsbG8=\\n';
      },
    },
  });

  assert.equal(typeof clipboard.readTextFromClipboard, 'function');
  assert.equal(await clipboard.readTextFromClipboard(), 'aGVsbG8=\\n');
});

test('reports null when clipboard read is unavailable', async () => {
  setGlobal('navigator', {});

  assert.equal(typeof clipboard.readTextFromClipboard, 'function');
  assert.equal(await clipboard.readTextFromClipboard(), null);
});

test('reports null when Clipboard API read fails', async () => {
  setGlobal('navigator', {
    clipboard: {
      async readText() {
        throw new Error('NotAllowedError');
      },
    },
  });

  assert.equal(typeof clipboard.readTextFromClipboard, 'function');
  assert.equal(await clipboard.readTextFromClipboard(), null);
});

function setGlobal(key, value) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });
}
