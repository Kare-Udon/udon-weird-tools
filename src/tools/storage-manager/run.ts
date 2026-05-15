export type StorageManagerInput = Record<string, never>;

export type StorageManagerOutput = {
  message: string;
};

export function run(): StorageManagerOutput {
  return {
    message: 'Storage Manager uses a dedicated browser UI because it needs origin storage permissions.',
  };
}
