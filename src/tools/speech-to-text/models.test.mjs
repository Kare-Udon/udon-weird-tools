import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SPEECH_MODEL_CACHE_NAME,
  getDefaultSpeechLanguage,
  getSpeechModelCacheCoverage,
  getSpeechModelFileCachePath,
  getSpeechModelFileFromTransformersRequest,
  speechModelOptions,
} from './models.ts';

test('exposes exactly the four supported Moonshine language models with pipeline-compatible ONNX repos', () => {
  assert.deepEqual(
    speechModelOptions.map((option) => [option.language, option.modelId, option.storageModelId]),
    [
      ['english', 'onnx-community/moonshine-tiny-ONNX', 'moonshine-tiny-en'],
      ['chinese', 'onnx-community/moonshine-base-zh-ONNX', 'moonshine-base-zh'],
      ['japanese', 'onnx-community/moonshine-base-ja-ONNX', 'moonshine-base-ja'],
      ['korean', 'onnx-community/moonshine-tiny-ko-ONNX', 'moonshine-tiny-ko'],
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
  const urlFor = (file) => getSpeechModelFileCachePath(model, file);

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

test('uses the shared tool file cache contract for Moonshine models', () => {
  const model = speechModelOptions[0];

  assert.equal(SPEECH_MODEL_CACHE_NAME, 'weird-tools:tool:speech-to-text:files');
  assert.equal(getSpeechModelFileCachePath(model, 'onnx/encoder_model_quantized.onnx'), '/__tool-storage/speech-to-text/models/moonshine-tiny-en/onnx/encoder_model_quantized.onnx');
  assert.equal(
    getSpeechModelFileFromTransformersRequest(`https://huggingface.co/${model.modelId}/resolve/main/tokenizer.json`, model),
    'tokenizer.json',
  );
  assert.equal(getSpeechModelFileFromTransformersRequest(`/models/${model.modelId}/onnx/decoder_model_merged_quantized.onnx`, model), 'onnx/decoder_model_merged_quantized.onnx');
});
