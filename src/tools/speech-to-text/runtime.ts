type ProcessorWithComponents = {
  components?: {
    tokenizer?: unknown;
  };
};

type PipelineWithTokenizer = {
  tokenizer?: unknown;
  processor?: ProcessorWithComponents;
};

export type BrowserRuntimeHints = {
  maxTouchPoints?: number;
  platform?: string;
  userAgent?: string;
};

export type OnnxRuntimeWasmPaths = {
  mjs: string;
  wasm: string;
};

export function bindProcessorTokenizer<T>(pipeline: T): T {
  const candidate = pipeline as PipelineWithTokenizer;

  if (!candidate.tokenizer || !candidate.processor?.components || candidate.processor.components.tokenizer) {
    return pipeline;
  }

  candidate.processor.components.tokenizer = candidate.tokenizer;
  return pipeline;
}

export function getOnnxRuntimeWasmPaths(baseUrl: string, hints: BrowserRuntimeHints): OnnxRuntimeWasmPaths {
  const variant = shouldUsePlainOnnxRuntimeWasm(hints) ? '' : '.asyncify';

  return {
    mjs: new URL(`/vendor/onnxruntime/ort-wasm-simd-threaded${variant}.mjs`, baseUrl).href,
    wasm: new URL(`/vendor/onnxruntime/ort-wasm-simd-threaded${variant}.wasm`, baseUrl).href,
  };
}

export function shouldUsePlainOnnxRuntimeWasm(hints: BrowserRuntimeHints): boolean {
  const userAgent = hints.userAgent ?? '';
  const platform = hints.platform ?? '';
  const maxTouchPoints = hints.maxTouchPoints ?? 0;
  const isIosFamily =
    /\b(iPhone|iPad|iPod)\b/i.test(userAgent) ||
    /\b(iPhone|iPad|iPod)\b/i.test(platform) ||
    (platform === 'MacIntel' && maxTouchPoints > 1 && /AppleWebKit/i.test(userAgent));

  if (isIosFamily) {
    return true;
  }

  return /Safari/i.test(userAgent) && !/\b(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)\b/i.test(userAgent);
}
