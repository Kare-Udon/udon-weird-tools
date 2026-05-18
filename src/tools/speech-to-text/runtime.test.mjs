import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindProcessorTokenizer, getOnnxRuntimeWasmPaths, shouldReleaseSpeechRuntimeAfterTranscribe, shouldUsePlainOnnxRuntimeWasm } from './runtime.ts';

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

test('uses plain ONNX Runtime wasm on iOS WebKit devices', () => {
  assert.equal(
    shouldUsePlainOnnxRuntimeWasm({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    }),
    true,
  );

  assert.equal(
    shouldUsePlainOnnxRuntimeWasm({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    }),
    true,
  );
});

test('uses plain ONNX Runtime wasm for iPadOS desktop-mode browsers', () => {
  assert.equal(
    shouldUsePlainOnnxRuntimeWasm({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }),
    true,
  );
});

test('uses asyncify ONNX Runtime wasm on non-WebKit desktop browsers', () => {
  assert.equal(
    shouldUsePlainOnnxRuntimeWasm({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    }),
    false,
  );
});

test('builds ONNX Runtime wasm paths from the selected browser variant', () => {
  assert.deepEqual(
    getOnnxRuntimeWasmPaths('https://tools.udon.icu/zh-CN/tools/speech-to-text/', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/136.0.0.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    }, 'wasm'),
    {
      mjs: 'https://tools.udon.icu/vendor/onnxruntime/ort-wasm-simd-threaded.mjs',
      wasm: 'https://tools.udon.icu/vendor/onnxruntime/ort-wasm-simd-threaded.wasm',
    },
  );

  assert.deepEqual(
    getOnnxRuntimeWasmPaths('https://tools.udon.icu/zh-CN/tools/speech-to-text/', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    }, 'webgpu'),
    {
      mjs: 'https://tools.udon.icu/vendor/onnxruntime/ort-wasm-simd-threaded.asyncify.mjs',
      wasm: 'https://tools.udon.icu/vendor/onnxruntime/ort-wasm-simd-threaded.asyncify.wasm',
    },
  );
});

test('uses asyncify ONNX Runtime wasm for WebGPU even on iOS WebKit', () => {
  assert.deepEqual(
    getOnnxRuntimeWasmPaths('https://tools.udon.icu/zh-CN/tools/speech-to-text/', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    }, 'webgpu'),
    {
      mjs: 'https://tools.udon.icu/vendor/onnxruntime/ort-wasm-simd-threaded.asyncify.mjs',
      wasm: 'https://tools.udon.icu/vendor/onnxruntime/ort-wasm-simd-threaded.asyncify.wasm',
    },
  );
});

test('releases speech runtime after transcription on iOS WebKit devices', () => {
  assert.equal(
    shouldReleaseSpeechRuntimeAfterTranscribe({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    }),
    true,
  );

  assert.equal(
    shouldReleaseSpeechRuntimeAfterTranscribe({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    }),
    false,
  );
});
