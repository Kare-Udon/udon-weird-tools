import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import { run, type VrcPhotoMetadataInput, type VrcPhotoMetadataOutput } from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<VrcPhotoMetadataInput, VrcPhotoMetadataOutput>;

export { examples, inputFields, manifest, run };
export type { VrcPhotoMetadataInput, VrcPhotoMetadataOutput };
export default moduleDefinition;
