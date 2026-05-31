import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import { run, type Base64CodecInput, type Base64CodecOutput } from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<Base64CodecInput, Base64CodecOutput>;

export { examples, inputFields, manifest, run };
export type { Base64CodecInput, Base64CodecOutput };
export default moduleDefinition;
