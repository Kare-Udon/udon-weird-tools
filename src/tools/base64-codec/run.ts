export type Base64CodecInput = {
  text: string;
  mode: 'encode' | 'decode';
  encoding: 'utf-8' | 'latin1';
  urlSafe: boolean;
  wrap: boolean;
};

export type Base64CodecOutput = {
  text: string;
  inputBytes: number;
  outputCharacters: number;
  mode: Base64CodecInput['mode'];
};

export function run(input: Base64CodecInput): Base64CodecOutput {
  const text = String(input.text ?? '');

  if (!text) {
    return {
      text: '',
      inputBytes: 0,
      outputCharacters: 0,
      mode: input.mode,
    };
  }

  const outputText =
    input.mode === 'decode'
      ? decodeBase64(text, input.encoding, input.urlSafe)
      : encodeBase64(text, input.encoding, input.urlSafe, input.wrap);

  return {
    text: outputText,
    inputBytes: getInputByteCount(text, input),
    outputCharacters: outputText.length,
    mode: input.mode,
  };
}

function encodeBase64(text: string, encoding: Base64CodecInput['encoding'], urlSafe: boolean, wrap: boolean): string {
  const bytes = encodeText(text, encoding);
  let output = bytesToBase64(bytes);

  if (urlSafe) {
    output = output.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  return wrap ? wrapLines(output, 76) : output;
}

function decodeBase64(text: string, encoding: Base64CodecInput['encoding'], urlSafe: boolean): string {
  const normalized = normalizeBase64(text, urlSafe);
  const bytes = base64ToBytes(normalized);

  return decodeText(bytes, encoding);
}

function normalizeBase64(text: string, urlSafe: boolean): string {
  let normalized = text.replace(/\s+/g, '');

  if (!normalized) return '';

  if (urlSafe) {
    normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
  }

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || /=/.test(normalized.slice(0, -2))) {
    throw new Error('Invalid Base64 input.');
  }

  const remainder = normalized.length % 4;

  if (remainder === 1) {
    throw new Error('Invalid Base64 input.');
  }

  if (remainder > 0) {
    normalized = normalized.padEnd(normalized.length + (4 - remainder), '=');
  }

  return normalized;
}

function encodeText(text: string, encoding: Base64CodecInput['encoding']): Uint8Array {
  if (encoding === 'latin1') {
    const bytes = new Uint8Array(text.length);

    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);

      if (code > 0xff) {
        throw new Error('Latin-1 encoding only supports characters from U+0000 to U+00FF.');
      }

      bytes[index] = code;
    }

    return bytes;
  }

  return new TextEncoder().encode(text);
}

function decodeText(bytes: Uint8Array, encoding: Base64CodecInput['encoding']): string {
  if (encoding === 'latin1') {
    return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  }

  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function getInputByteCount(text: string, input: Base64CodecInput): number {
  if (input.mode === 'decode') {
    return text.replace(/\s+/g, '').length;
  }

  return encodeText(text, input.encoding).byteLength;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    throw new Error('Invalid Base64 input.');
  }
}

function wrapLines(value: string, lineLength: number): string {
  return value.match(new RegExp(`.{1,${lineLength}}`, 'g'))?.join('\n') ?? '';
}
