import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import { run, type CaseConverterInput, type CaseConverterOutput } from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<CaseConverterInput, CaseConverterOutput>;

export { examples, inputFields, manifest, run };
export type { CaseConverterInput, CaseConverterOutput };
export default moduleDefinition;
