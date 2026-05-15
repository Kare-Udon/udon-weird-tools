import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import { run, type StorageManagerInput, type StorageManagerOutput } from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<StorageManagerInput, StorageManagerOutput>;

export { examples, inputFields, manifest, run };
export type { StorageManagerInput, StorageManagerOutput };
export default moduleDefinition;
