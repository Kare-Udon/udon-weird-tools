import { examples } from './examples';
import { manifest } from './manifest';
import { inputFields } from './schema';
import { transcribeSpeechToText, type SpeechToTextInput, type SpeechToTextOutput } from './run';
import type { ToolModule } from '../_types';

export const tool: ToolModule<SpeechToTextInput, SpeechToTextOutput> = {
  manifest,
  inputFields,
  examples,
  run: transcribeSpeechToText,
};

export default tool;
