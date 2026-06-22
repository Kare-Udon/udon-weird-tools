import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import { run, type XPhotoUploadPreprocessorInput, type XPhotoUploadPreprocessorOutput } from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<XPhotoUploadPreprocessorInput, XPhotoUploadPreprocessorOutput>;

export { examples, inputFields, manifest, run };
export type { XPhotoUploadPreprocessorInput, XPhotoUploadPreprocessorOutput };
export default moduleDefinition;
