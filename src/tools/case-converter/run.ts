export type CaseConverterInput = {
  text: string;
  targetCase: 'camel' | 'pascal' | 'snake' | 'kebab' | 'constant';
  perLine: boolean;
};

export type CaseConverterOutput = {
  text: string;
};

export function run(input: CaseConverterInput): CaseConverterOutput {
  const text = String(input.text ?? '');

  if (!text.trim()) {
    throw new Error('Input is empty.');
  }

  const convert = (value: string) => convertWords(splitWords(value), input.targetCase);

  return {
    text: input.perLine ? text.split(/\r?\n/).map(convert).join('\n') : convert(text),
  };
}

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-./]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function convertWords(words: string[], targetCase: CaseConverterInput['targetCase']): string {
  if (words.length === 0) return '';

  switch (targetCase) {
    case 'camel':
      return words[0] + words.slice(1).map(capitalize).join('');
    case 'pascal':
      return words.map(capitalize).join('');
    case 'snake':
      return words.join('_');
    case 'kebab':
      return words.join('-');
    case 'constant':
      return words.join('_').toUpperCase();
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
