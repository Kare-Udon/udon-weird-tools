import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import { run, type UnityPackageExtractorInput, type UnityPackageExtractorOutput } from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<UnityPackageExtractorInput, UnityPackageExtractorOutput>;

export { examples, inputFields, manifest, run };
export type { UnityPackageExtractorInput, UnityPackageExtractorOutput };
export default moduleDefinition;
