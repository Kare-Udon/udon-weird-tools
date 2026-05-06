import type { Locale } from '@/i18n/config';

export type LocalizedText = Record<Locale, string>;

export type ToolCategory = 'text' | 'data' | 'date' | 'dev';

export type ToolStatus = 'stable' | 'experimental';

export type ToolResultType = 'text' | 'json' | 'table' | 'download';

export type ToolExecutionMode = 'sync' | 'worker';

export type ToolManifest = {
  slug: string;
  version: string;
  category: ToolCategory;
  tags: string[];
  status: ToolStatus;
  runtime: 'client';
  execution: {
    mode: ToolExecutionMode;
    worker: boolean;
    pure: true;
  };
  ui: {
    resultType: ToolResultType;
  };
  i18n: {
    name: LocalizedText;
    description: LocalizedText;
  };
};

export type ToolFieldOption = {
  label: LocalizedText;
  value: string;
};

export type ToolFieldBase = {
  name: string;
  label: LocalizedText;
  helperText?: Partial<LocalizedText>;
  required?: boolean;
};

export type TextToolField = ToolFieldBase & {
  type: 'text';
  defaultValue?: string;
  placeholder?: Partial<LocalizedText>;
};

export type TextareaToolField = ToolFieldBase & {
  type: 'textarea';
  defaultValue?: string;
  rows?: number;
  placeholder?: Partial<LocalizedText>;
};

export type NumberToolField = ToolFieldBase & {
  type: 'number';
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
};

export type SelectToolField = ToolFieldBase & {
  type: 'select';
  defaultValue?: string;
  options: ToolFieldOption[];
};

export type CheckboxToolField = ToolFieldBase & {
  type: 'checkbox';
  defaultValue?: boolean;
};

export type FileToolField = ToolFieldBase & {
  type: 'file';
  accept?: string;
  maxSizeBytes?: number;
};

export type ToolField =
  | TextToolField
  | TextareaToolField
  | NumberToolField
  | SelectToolField
  | CheckboxToolField
  | FileToolField;

export type ToolExample<Input extends Record<string, unknown> = Record<string, unknown>> = {
  name: LocalizedText;
  input: Input;
};

export type ToolRunContext = {
  locale: Locale;
  signal?: AbortSignal;
  now: () => Date;
};

export type ToolModule<
  Input extends Record<string, unknown> = Record<string, unknown>,
  Output = unknown,
> = {
  manifest: ToolManifest;
  inputFields: ToolField[];
  examples: ToolExample<Input>[];
  run: (input: Input, context: ToolRunContext) => Output | Promise<Output>;
};
