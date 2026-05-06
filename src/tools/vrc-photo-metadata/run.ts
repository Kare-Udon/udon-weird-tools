import type { Locale } from '@/i18n/config';
import type { ToolRunContext } from '../_types';

const MAX_PHOTO_BYTES = 80 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const XMP_KEYWORD = 'XML:com.adobe.xmp';

export type VrcPhotoMetadataInput = {
  photoFile: File | null;
};

export type VrcPhotoMetadataOutput = {
  username: string;
  worldId: string;
  worldDisplayName: string;
  authorId: string;
};

type VrcMetadataKey = keyof VrcPhotoMetadataOutput;

export async function run(input: VrcPhotoMetadataInput, context?: ToolRunContext): Promise<VrcPhotoMetadataOutput> {
  return parseVrcPhotoMetadata(input.photoFile, context?.locale ?? 'en');
}

export async function parseVrcPhotoMetadata(file: File | null, locale: Locale = 'en'): Promise<VrcPhotoMetadataOutput> {
  if (!file) {
    throw new Error(message(locale, 'missingFile'));
  }

  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error(message(locale, 'fileTooLarge', formatBytes(MAX_PHOTO_BYTES)));
  }

  if (file.type && file.type !== 'image/png') {
    throw new Error(message(locale, 'notPng'));
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const xmp = extractXmpFromPng(bytes, locale);
  const result = {
    username: readXmlTag(xmp, 'Author'),
    worldId: readXmlTag(xmp, 'WorldID'),
    worldDisplayName: readXmlTag(xmp, 'WorldDisplayName'),
    authorId: readXmlTag(xmp, 'AuthorID'),
  } satisfies Record<VrcMetadataKey, string | null>;
  const missing = Object.entries(result)
    .filter(([, value]) => !value)
    .map(([key]) => fieldLabel(locale, key as VrcMetadataKey));

  if (missing.length > 0) {
    throw new Error(message(locale, 'missingFields', missing.join(', ')));
  }

  return result as VrcPhotoMetadataOutput;
}

function extractXmpFromPng(bytes: Uint8Array, locale: Locale): string {
  if (!hasPngSignature(bytes)) {
    throw new Error(message(locale, 'notPng'));
  }

  const decoder = new TextDecoder();
  let offset: number = PNG_SIGNATURE.length;

  while (offset + 12 <= bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    const length = view.getUint32(0, false);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;

    if (dataEnd > bytes.byteLength || nextOffset > bytes.byteLength) {
      throw new Error(message(locale, 'invalidPng'));
    }

    if (type === 'iTXt') {
      const xmp = parseItxtXmp(bytes.subarray(dataStart, dataEnd), locale);
      if (xmp) return xmp;
    }

    if (type === 'tEXt') {
      const xmp = parseTextXmp(bytes.subarray(dataStart, dataEnd));
      if (xmp) return xmp;
    }

    if (type === 'IEND') break;
    offset = nextOffset;
  }

  throw new Error(message(locale, 'missingXmp'));
}

function parseItxtXmp(data: Uint8Array, locale: Locale): string | null {
  const keywordEnd = data.indexOf(0);
  if (keywordEnd < 0) return null;

  const keyword = new TextDecoder('latin1').decode(data.subarray(0, keywordEnd));
  if (keyword !== XMP_KEYWORD) return null;

  const compressionFlag = data[keywordEnd + 1];
  const compressionMethod = data[keywordEnd + 2];
  let cursor = keywordEnd + 3;

  if (compressionFlag === 1 || compressionMethod !== 0) {
    throw new Error(message(locale, 'compressedXmp'));
  }

  const languageEnd = findZero(data, cursor);
  if (languageEnd < 0) throw new Error(message(locale, 'invalidXmpChunk'));
  cursor = languageEnd + 1;

  const translatedKeywordEnd = findZero(data, cursor);
  if (translatedKeywordEnd < 0) throw new Error(message(locale, 'invalidXmpChunk'));
  cursor = translatedKeywordEnd + 1;

  return new TextDecoder().decode(data.subarray(cursor));
}

function parseTextXmp(data: Uint8Array): string | null {
  const keywordEnd = data.indexOf(0);
  if (keywordEnd < 0) return null;

  const keyword = new TextDecoder('latin1').decode(data.subarray(0, keywordEnd));
  if (keyword !== XMP_KEYWORD) return null;

  return new TextDecoder('latin1').decode(data.subarray(keywordEnd + 1));
}

function readXmlTag(xml: string, localName: string): string | null {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${escapeRegExp(localName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escapeRegExp(localName)}>`, 'i');
  const match = xml.match(pattern);
  const value = match?.[1]?.trim();

  return value ? decodeXmlEntities(value) : null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function findZero(data: Uint8Array, start: number): number {
  for (let index = start; index < data.byteLength; index += 1) {
    if (data[index] === 0) return index;
  }

  return -1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function fieldLabel(locale: Locale, key: VrcMetadataKey): string {
  const labels: Record<VrcMetadataKey, Record<Locale, string>> = {
    username: {
      'zh-CN': '用户名',
      en: 'username',
      ja: 'ユーザー名',
    },
    worldId: {
      'zh-CN': '世界 ID',
      en: 'world ID',
      ja: 'ワールド ID',
    },
    worldDisplayName: {
      'zh-CN': '世界名',
      en: 'world name',
      ja: 'ワールド名',
    },
    authorId: {
      'zh-CN': '作者 ID',
      en: 'author ID',
      ja: '作者 ID',
    },
  };

  return labels[key][locale];
}

function message(locale: Locale, key: string, detail = ''): string {
  const messages: Record<string, Record<Locale, string>> = {
    missingFile: {
      'zh-CN': '请选择一张 VRChat PNG 照片。',
      en: 'Choose a VRChat PNG photo.',
      ja: 'VRChat PNG 写真を選択してください。',
    },
    fileTooLarge: {
      'zh-CN': `文件太大。当前限制为 ${detail}。`,
      en: `The file is too large. The current limit is ${detail}.`,
      ja: `ファイルが大きすぎます。現在の上限は ${detail} です。`,
    },
    notPng: {
      'zh-CN': '这个文件不是 PNG 图片。',
      en: 'This file is not a PNG image.',
      ja: 'このファイルは PNG 画像ではありません。',
    },
    invalidPng: {
      'zh-CN': 'PNG 文件结构不完整或已损坏。',
      en: 'The PNG structure is incomplete or corrupted.',
      ja: 'PNG 構造が不完全、または破損しています。',
    },
    missingXmp: {
      'zh-CN': '没有找到 VRChat 写入的 XMP metadata。',
      en: 'No VRChat XMP metadata was found.',
      ja: 'VRChat が書き込んだ XMP メタデータが見つかりません。',
    },
    compressedXmp: {
      'zh-CN': '这张图片的 XMP metadata 使用了压缩格式，当前工具暂不支持。',
      en: 'This image uses compressed XMP metadata, which is not supported yet.',
      ja: 'この画像の XMP メタデータは圧縮形式のため、現在は対応していません。',
    },
    invalidXmpChunk: {
      'zh-CN': 'XMP metadata chunk 格式不完整。',
      en: 'The XMP metadata chunk is incomplete.',
      ja: 'XMP メタデータチャンクが不完全です。',
    },
    missingFields: {
      'zh-CN': `已找到 XMP metadata，但缺少必要字段：${detail}。`,
      en: `XMP metadata was found, but required fields are missing: ${detail}.`,
      ja: `XMP メタデータは見つかりましたが、必須フィールドが不足しています: ${detail}。`,
    },
  };

  return messages[key]?.[locale] ?? messages[key]?.en ?? key;
}
