import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import { run, type JsonCleanerInput, type JsonCleanerOutput } from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<JsonCleanerInput, JsonCleanerOutput>;

export { examples, inputFields, manifest, run };
export type { JsonCleanerInput, JsonCleanerOutput };
export default moduleDefinition;
