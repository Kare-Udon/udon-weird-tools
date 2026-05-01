import type { ToolModule } from '../_types';
import { examples } from './examples';
import { manifest } from './manifest';
import { run, type TimestampConverterInput, type TimestampConverterOutput } from './run';
import { inputFields } from './schema';

const moduleDefinition = {
  manifest,
  inputFields,
  examples,
  run,
} satisfies ToolModule<TimestampConverterInput, TimestampConverterOutput>;

export { examples, inputFields, manifest, run };
export type { TimestampConverterInput, TimestampConverterOutput };
export default moduleDefinition;
