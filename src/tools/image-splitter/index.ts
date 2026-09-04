import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import {
  run,
  type ImageSplitterInput,
  type ImageSplitterOutput,
} from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<ImageSplitterInput, ImageSplitterOutput>;

export { examples, inputFields, manifest, run };
export type { ImageSplitterInput, ImageSplitterOutput };
export * from './state';
export default moduleDefinition;
