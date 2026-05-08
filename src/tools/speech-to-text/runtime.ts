type ProcessorWithComponents = {
  components?: {
    tokenizer?: unknown;
  };
};

type PipelineWithTokenizer = {
  tokenizer?: unknown;
  processor?: ProcessorWithComponents;
};

export function bindProcessorTokenizer<T>(pipeline: T): T {
  const candidate = pipeline as PipelineWithTokenizer;

  if (!candidate.tokenizer || !candidate.processor?.components || candidate.processor.components.tokenizer) {
    return pipeline;
  }

  candidate.processor.components.tokenizer = candidate.tokenizer;
  return pipeline;
}
