import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDefaultSpeechLanguage, getSpeechModelCacheCoverage, speechModelOptions } from './models.ts';

test('exposes exactly the four supported Moonshine language models with pipeline-compatible ONNX repos', () => {
  assert.deepEqual(
    speechModelOptions.map((option) => [option.language, option.modelId]),
    [
      ['english', 'onnx-community/moonshine-tiny-ONNX'],
      ['chinese', 'onnx-community/moonshine-base-zh-ONNX'],
      ['japanese', 'onnx-community/moonshine-base-ja-ONNX'],
      ['korean', 'onnx-community/moonshine-tiny-ko-ONNX'],
    ],
  );
});

test('chooses a locale-aware default language', () => {
  assert.equal(getDefaultSpeechLanguage('zh-CN'), 'chinese');
  assert.equal(getDefaultSpeechLanguage('ja'), 'japanese');
  assert.equal(getDefaultSpeechLanguage('en'), 'english');
});

test('classifies model cache coverage without treating partial bundles as downloaded', () => {
  const model = speechModelOptions[0];
  const urlFor = (file) => `https://huggingface.co/${model.modelId}/resolve/main/${file}`;

  assert.deepEqual(getSpeechModelCacheCoverage([], model), {
    state: 'empty',
    downloadedFiles: 0,
    totalFiles: model.requiredFiles.length,
  });

  assert.deepEqual(getSpeechModelCacheCoverage([urlFor('config.json'), urlFor('tokenizer.json')], model), {
    state: 'partial',
    downloadedFiles: 2,
    totalFiles: model.requiredFiles.length,
  });

  assert.deepEqual(getSpeechModelCacheCoverage(model.requiredFiles.map(urlFor), model), {
    state: 'downloaded',
    downloadedFiles: model.requiredFiles.length,
    totalFiles: model.requiredFiles.length,
  });
});
