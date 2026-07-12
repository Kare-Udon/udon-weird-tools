import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import { run, type CodexAnalyzerInput, type CodexAnalysisResult } from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<CodexAnalyzerInput, CodexAnalysisResult>;

export { examples, inputFields, manifest, run };
export type { CodexAnalyzerInput, CodexAnalysisResult };
export default moduleDefinition;
