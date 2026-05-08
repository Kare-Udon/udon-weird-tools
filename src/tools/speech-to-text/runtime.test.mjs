import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindProcessorTokenizer } from './runtime.ts';

test('binds the pipeline tokenizer back to a generic processor', () => {
  const tokenizer = { batch_decode: () => ['ok'] };
  const pipeline = {
    tokenizer,
    processor: {
      components: {},
    },
  };

  assert.equal(bindProcessorTokenizer(pipeline), pipeline);
  assert.equal(pipeline.processor.components.tokenizer, tokenizer);
});

test('does not overwrite an existing processor tokenizer', () => {
  const existingTokenizer = { batch_decode: () => ['existing'] };
  const pipeline = {
    tokenizer: { batch_decode: () => ['pipeline'] },
    processor: {
      components: {
        tokenizer: existingTokenizer,
      },
    },
  };

  bindProcessorTokenizer(pipeline);

  assert.equal(pipeline.processor.components.tokenizer, existingTokenizer);
});
