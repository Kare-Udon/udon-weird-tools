import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const css = await readFile(new URL('./global.css', import.meta.url), 'utf8');

test('Base64 panels and textarea cannot expand the mobile page width', () => {
  assertSelectorIncludes('.base64-panel', ['min-width: 0']);
  assertSelectorIncludes('.base64-textarea', ['min-width: 0', 'max-width: 100%', 'overflow-x: auto']);
});

function assertSelectorIncludes(selector, declarations) {
  const block = selectorBlock(selector);

  for (const declaration of declarations) {
    assert.ok(block.includes(declaration), `${selector} should include "${declaration}"`);
  }
}

function selectorBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<block>[^}]*)\\}`));

  assert.ok(match?.groups?.block, `${selector} block should exist`);
  return match.groups.block.replace(/\s+/g, ' ').trim();
}
