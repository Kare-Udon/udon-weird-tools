import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import { run, type UnicodeFancyTextInput, type UnicodeFancyTextOutput } from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<UnicodeFancyTextInput, UnicodeFancyTextOutput>;

export { examples, inputFields, manifest, run };
export type { UnicodeFancyTextInput, UnicodeFancyTextOutput };
export default moduleDefinition;
