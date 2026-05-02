import type { LocalizedText } from '../_types';

export type UnicodeFancyTextInput = {
  text: string;
  unsupportedMode: 'preserve' | 'omit';
};

export type UnicodeFancyTextItem = {
  id: string;
  name: LocalizedText;
  category: LocalizedText;
  text: string;
};

export type UnicodeFancyTextOutput = {
  items: UnicodeFancyTextItem[];
};

type UnsupportedMode = UnicodeFancyTextInput['unsupportedMode'];

type StyleSpec = {
  id: string;
  name: LocalizedText;
  category: LocalizedText;
  transform: (text: string, unsupportedMode: UnsupportedMode) => string;
};

type AlphabetSpec = {
  upper?: number;
  lower?: number;
  digit?: number;
  exceptions?: Partial<Record<string, string>>;
  digitExceptions?: Partial<Record<string, string>>;
  space?: string;
};

const categories = {
  alphabet: {
    'zh-CN': '字母替换',
    en: 'Alphabet',
    ja: '英数字変換',
  },
  enclosed: {
    'zh-CN': '圈框字符',
    en: 'Enclosed',
    ja: '囲み文字',
  },
  tiny: {
    'zh-CN': '小字效果',
    en: 'Tiny',
    ja: '小文字効果',
  },
  direction: {
    'zh-CN': '方向变形',
    en: 'Direction',
    ja: '方向変形',
  },
  marks: {
    'zh-CN': '组合符号',
    en: 'Combining Marks',
    ja: '結合記号',
  },
  decorative: {
    'zh-CN': '装饰分隔',
    en: 'Decorative',
    ja: '装飾',
  },
} as const satisfies Record<string, LocalizedText>;

const alphabetSpecs = {
  bold: {
    upper: 0x1d400,
    lower: 0x1d41a,
    digit: 0x1d7ce,
  },
  italic: {
    upper: 0x1d434,
    lower: 0x1d44e,
    exceptions: { h: 'ℎ' },
  },
  'bold-italic': {
    upper: 0x1d468,
    lower: 0x1d482,
  },
  script: {
    upper: 0x1d49c,
    lower: 0x1d4b6,
    exceptions: {
      B: 'ℬ',
      E: 'ℰ',
      F: 'ℱ',
      H: 'ℋ',
      I: 'ℐ',
      L: 'ℒ',
      M: 'ℳ',
      R: 'ℛ',
      e: 'ℯ',
      g: 'ℊ',
      o: 'ℴ',
    },
  },
  'bold-script': {
    upper: 0x1d4d0,
    lower: 0x1d4ea,
  },
  fraktur: {
    upper: 0x1d504,
    lower: 0x1d51e,
    exceptions: {
      C: 'ℭ',
      H: 'ℌ',
      I: 'ℑ',
      R: 'ℜ',
      Z: 'ℨ',
    },
  },
  'bold-fraktur': {
    upper: 0x1d56c,
    lower: 0x1d586,
  },
  'double-struck': {
    upper: 0x1d538,
    lower: 0x1d552,
    digit: 0x1d7d8,
    exceptions: {
      C: 'ℂ',
      H: 'ℍ',
      N: 'ℕ',
      P: 'ℙ',
      Q: 'ℚ',
      R: 'ℝ',
      Z: 'ℤ',
    },
  },
  sans: {
    upper: 0x1d5a0,
    lower: 0x1d5ba,
    digit: 0x1d7e2,
  },
  'sans-bold': {
    upper: 0x1d5d4,
    lower: 0x1d5ee,
    digit: 0x1d7ec,
  },
  'sans-italic': {
    upper: 0x1d608,
    lower: 0x1d622,
  },
  'sans-bold-italic': {
    upper: 0x1d63c,
    lower: 0x1d656,
  },
  monospace: {
    upper: 0x1d670,
    lower: 0x1d68a,
    digit: 0x1d7f6,
  },
  fullwidth: {
    upper: 0xff21,
    lower: 0xff41,
    digit: 0xff10,
    space: '　',
  },
  circled: {
    upper: 0x24b6,
    lower: 0x24d0,
    digitExceptions: {
      '0': '⓪',
      '1': '①',
      '2': '②',
      '3': '③',
      '4': '④',
      '5': '⑤',
      '6': '⑥',
      '7': '⑦',
      '8': '⑧',
      '9': '⑨',
    },
  },
  'negative-circled': {
    upper: 0x1f150,
    lower: 0x1f150,
    digitExceptions: {
      '0': '⓿',
      '1': '❶',
      '2': '❷',
      '3': '❸',
      '4': '❹',
      '5': '❺',
      '6': '❻',
      '7': '❼',
      '8': '❽',
      '9': '❾',
    },
  },
  squared: {
    upper: 0x1f130,
    lower: 0x1f130,
  },
  'negative-squared': {
    upper: 0x1f170,
    lower: 0x1f170,
  },
  parenthesized: {
    lower: 0x249c,
    digitExceptions: {
      '1': '⑴',
      '2': '⑵',
      '3': '⑶',
      '4': '⑷',
      '5': '⑸',
      '6': '⑹',
      '7': '⑺',
      '8': '⑻',
      '9': '⑼',
    },
  },
} as const satisfies Record<string, AlphabetSpec>;

const smallCaps: Record<string, string> = {
  a: 'ᴀ',
  b: 'ʙ',
  c: 'ᴄ',
  d: 'ᴅ',
  e: 'ᴇ',
  f: 'ꜰ',
  g: 'ɢ',
  h: 'ʜ',
  i: 'ɪ',
  j: 'ᴊ',
  k: 'ᴋ',
  l: 'ʟ',
  m: 'ᴍ',
  n: 'ɴ',
  o: 'ᴏ',
  p: 'ᴘ',
  q: 'ǫ',
  r: 'ʀ',
  s: 'ꜱ',
  t: 'ᴛ',
  u: 'ᴜ',
  v: 'ᴠ',
  w: 'ᴡ',
  x: 'x',
  y: 'ʏ',
  z: 'ᴢ',
};

const superscript: Record<string, string> = {
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  f: 'ᶠ',
  g: 'ᵍ',
  h: 'ʰ',
  i: 'ⁱ',
  j: 'ʲ',
  k: 'ᵏ',
  l: 'ˡ',
  m: 'ᵐ',
  n: 'ⁿ',
  o: 'ᵒ',
  p: 'ᵖ',
  r: 'ʳ',
  s: 'ˢ',
  t: 'ᵗ',
  u: 'ᵘ',
  v: 'ᵛ',
  w: 'ʷ',
  x: 'ˣ',
  y: 'ʸ',
  z: 'ᶻ',
  A: 'ᴬ',
  B: 'ᴮ',
  D: 'ᴰ',
  E: 'ᴱ',
  G: 'ᴳ',
  H: 'ᴴ',
  I: 'ᴵ',
  J: 'ᴶ',
  K: 'ᴷ',
  L: 'ᴸ',
  M: 'ᴹ',
  N: 'ᴺ',
  O: 'ᴼ',
  P: 'ᴾ',
  R: 'ᴿ',
  T: 'ᵀ',
  U: 'ᵁ',
  V: 'ⱽ',
  W: 'ᵂ',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

const subscript: Record<string, string> = {
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
};

const upsideDown: Record<string, string> = {
  a: 'ɐ',
  b: 'q',
  c: 'ɔ',
  d: 'p',
  e: 'ǝ',
  f: 'ɟ',
  g: 'ƃ',
  h: 'ɥ',
  i: 'ᴉ',
  j: 'ɾ',
  k: 'ʞ',
  l: 'ʃ',
  m: 'ɯ',
  n: 'u',
  o: 'o',
  p: 'd',
  q: 'b',
  r: 'ɹ',
  s: 's',
  t: 'ʇ',
  u: 'n',
  v: 'ʌ',
  w: 'ʍ',
  x: 'x',
  y: 'ʎ',
  z: 'z',
  A: '∀',
  B: 'ᗺ',
  C: 'Ɔ',
  D: 'ᗡ',
  E: 'Ǝ',
  F: 'Ⅎ',
  G: '⅁',
  J: 'ſ',
  K: 'Ʞ',
  L: '˥',
  M: 'W',
  P: 'Ԁ',
  Q: 'Ό',
  R: 'ᴚ',
  T: '⊥',
  U: '∩',
  V: 'Λ',
  Y: '⅄',
  '1': 'Ɩ',
  '2': 'ᄅ',
  '3': 'Ɛ',
  '4': 'ㄣ',
  '5': 'ϛ',
  '6': '9',
  '7': 'ㄥ',
  '8': '8',
  '9': '6',
  '0': '0',
  '.': '˙',
  ',': "'",
  "'": ',',
  '"': '„',
  '?': '¿',
  '!': '¡',
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
};

const mirror: Record<string, string> = {
  a: 'ɒ',
  b: 'd',
  c: 'ɔ',
  d: 'b',
  e: 'ɘ',
  f: 'ʇ',
  g: 'ǫ',
  h: 'ʜ',
  i: 'i',
  j: 'ꞁ',
  k: 'ʞ',
  l: 'l',
  m: 'm',
  n: 'ᴎ',
  o: 'o',
  p: 'q',
  q: 'p',
  r: 'ɿ',
  s: 'ꙅ',
  t: 'ƚ',
  u: 'υ',
  v: 'v',
  w: 'w',
  x: 'x',
  y: 'ʏ',
  z: 'ƹ',
  B: 'ᙠ',
  C: 'Ɔ',
  D: 'ᗡ',
  E: 'Ǝ',
  F: 'ꟻ',
  G: 'Ꭾ',
  J: 'Ⴑ',
  K: 'ꓘ',
  L: '⅃',
  N: 'ᴎ',
  P: 'ꟼ',
  R: 'Я',
  S: 'Ꙅ',
  Z: 'Ƹ',
};

const styleDefinitions = [
  alphabet('bold', { 'zh-CN': '粗体', en: 'Bold', ja: '太字' }),
  alphabet('italic', { 'zh-CN': '斜体', en: 'Italic', ja: 'イタリック' }),
  alphabet('bold-italic', { 'zh-CN': '粗斜体', en: 'Bold Italic', ja: '太字イタリック' }),
  alphabet('script', { 'zh-CN': '手写体', en: 'Script', ja: 'スクリプト' }),
  alphabet('bold-script', { 'zh-CN': '粗手写体', en: 'Bold Script', ja: '太字スクリプト' }),
  alphabet('fraktur', { 'zh-CN': '哥特体', en: 'Fraktur', ja: 'フラクトゥール' }),
  alphabet('bold-fraktur', { 'zh-CN': '粗哥特体', en: 'Bold Fraktur', ja: '太字フラクトゥール' }),
  alphabet('double-struck', { 'zh-CN': '双线体', en: 'Double Struck', ja: '二重線' }),
  alphabet('sans', { 'zh-CN': '无衬线', en: 'Sans Serif', ja: 'サンセリフ' }),
  alphabet('sans-bold', { 'zh-CN': '粗无衬线', en: 'Sans Serif Bold', ja: '太字サンセリフ' }),
  alphabet('sans-italic', { 'zh-CN': '斜无衬线', en: 'Sans Serif Italic', ja: 'サンセリフイタリック' }),
  alphabet('sans-bold-italic', { 'zh-CN': '粗斜无衬线', en: 'Sans Serif Bold Italic', ja: '太字サンセリフイタリック' }),
  alphabet('monospace', { 'zh-CN': '等宽体', en: 'Monospace', ja: '等幅' }),
  alphabet('fullwidth', { 'zh-CN': '全角 / Vaporwave', en: 'Fullwidth / Vaporwave', ja: '全角 / Vaporwave' }),
  alphabet('circled', { 'zh-CN': '圆圈字母', en: 'Circled', ja: '丸囲み' }, categories.enclosed),
  alphabet('negative-circled', { 'zh-CN': '反白圆圈', en: 'Negative Circled', ja: '反転丸囲み' }, categories.enclosed),
  alphabet('squared', { 'zh-CN': '方框字母', en: 'Squared', ja: '四角囲み' }, categories.enclosed),
  alphabet('negative-squared', { 'zh-CN': '反白方框', en: 'Negative Squared', ja: '反転四角囲み' }, categories.enclosed),
  alphabet('parenthesized', { 'zh-CN': '括号字母', en: 'Parenthesized', ja: '括弧付き' }, categories.enclosed),
  mapped('small-caps', { 'zh-CN': '小型大写', en: 'Small Caps', ja: 'スモールキャップス' }, categories.tiny, smallCaps, { lowerInput: true }),
  mapped('superscript', { 'zh-CN': '上标', en: 'Superscript', ja: '上付き' }, categories.tiny, superscript),
  mapped('subscript', { 'zh-CN': '下标', en: 'Subscript', ja: '下付き' }, categories.tiny, subscript),
  mapped('upside-down', { 'zh-CN': '倒置', en: 'Upside Down', ja: '上下反転' }, categories.direction, upsideDown, { reverse: true }),
  mapped('mirror', { 'zh-CN': '镜像', en: 'Mirror', ja: 'ミラー' }, categories.direction, mirror, { reverse: true }),
  custom('reverse', { 'zh-CN': '反向文本', en: 'Reverse', ja: '逆順' }, categories.direction, (text) => Array.from(text).reverse().join('')),
  mark('underline', { 'zh-CN': '下划线', en: 'Underline', ja: '下線' }, '\u0332'),
  mark('double-underline', { 'zh-CN': '双下划线', en: 'Double Underline', ja: '二重下線' }, '\u0333'),
  mark('strikethrough', { 'zh-CN': '删除线', en: 'Strikethrough', ja: '取り消し線' }, '\u0336'),
  mark('slashthrough', { 'zh-CN': '斜杠删除', en: 'Slashthrough', ja: '斜線' }, '\u0337'),
  mark('dotted-below', { 'zh-CN': '下方点', en: 'Dots Below', ja: '下点' }, '\u0323'),
  mark('ringed', { 'zh-CN': '上方圆环', en: 'Ringed', ja: '上リング' }, '\u030a'),
  mark('wavy', { 'zh-CN': '波浪线', en: 'Wavy', ja: '波線' }, '\u0330'),
  mark('stars-above', { 'zh-CN': '星标叠加', en: 'Stars Above', ja: '星付き' }, '\u20f0'),
  mark('light-zalgo', { 'zh-CN': '轻度故障风', en: 'Light Zalgo', ja: '軽いグリッチ' }, '\u0305\u0308\u0324'),
  decorate('wide-spacing', { 'zh-CN': '宽松间距', en: 'Wide Spacing', ja: '広め字間' }, ' ', ''),
  decorate('dot-separated', { 'zh-CN': '点分隔', en: 'Dot Separated', ja: '点区切り' }, '·', ''),
  decorate('dash-separated', { 'zh-CN': '短横分隔', en: 'Dash Separated', ja: 'ダッシュ区切り' }, '-', ''),
  decorate('arrowed', { 'zh-CN': '箭头分隔', en: 'Arrowed', ja: '矢印区切り' }, '→', ''),
  decorate('sparkled', { 'zh-CN': '星星分隔', en: 'Sparkled', ja: '星区切り' }, '✦', ''),
  custom('bracketed', { 'zh-CN': '方括号包裹', en: 'Bracketed', ja: '括弧装飾' }, categories.decorative, (text) =>
    Array.from(text)
      .map((character) => (character.trim() ? `〖${character}〗` : character))
      .join(''),
  ),
] as const satisfies readonly StyleSpec[];

export function run(input: UnicodeFancyTextInput): UnicodeFancyTextOutput {
  const text = String(input.text ?? '');
  const unsupportedMode = input.unsupportedMode === 'omit' ? 'omit' : 'preserve';

  if (!text.trim()) {
    throw new Error('Input is empty.');
  }

  return {
    items: styleDefinitions.map((style) => ({
      id: style.id,
      name: style.name,
      category: style.category,
      text: style.transform(text, unsupportedMode),
    })),
  };
}

function alphabet(id: keyof typeof alphabetSpecs, name: LocalizedText, category: LocalizedText = categories.alphabet): StyleSpec {
  const spec = alphabetSpecs[id];

  return {
    id,
    name,
    category,
    transform: (text, unsupportedMode) =>
      Array.from(text)
        .map((character) => transformAlphabetCharacter(character, spec, unsupportedMode))
        .join(''),
  };
}

function mapped(
  id: string,
  name: LocalizedText,
  category: LocalizedText,
  map: Record<string, string>,
  options: { lowerInput?: boolean; reverse?: boolean } = {},
): StyleSpec {
  return {
    id,
    name,
    category,
    transform: (text, unsupportedMode) => {
      const characters = options.reverse ? Array.from(text).reverse() : Array.from(text);

      return characters
        .map((character) => {
          const key = options.lowerInput ? character.toLowerCase() : character;
          return map[key] ?? (unsupportedMode === 'omit' ? '' : character);
        })
        .join('');
    },
  };
}

function mark(id: string, name: LocalizedText, marks: string): StyleSpec {
  return {
    id,
    name,
    category: categories.marks,
    transform: (text) =>
      Array.from(text)
        .map((character) => (character.trim() ? `${character}${marks}` : character))
        .join(''),
  };
}

function decorate(id: string, name: LocalizedText, separator: string, suffix: string): StyleSpec {
  return {
    id,
    name,
    category: categories.decorative,
    transform: (text) => {
      const lines = text.split(/\r?\n/);

      return lines
        .map((line) =>
          Array.from(line)
            .map((character) => (character.trim() ? `${character}${suffix}` : character))
            .join(separator),
        )
        .join('\n');
    },
  };
}

function custom(id: string, name: LocalizedText, category: LocalizedText, transform: (text: string) => string): StyleSpec {
  return {
    id,
    name,
    category,
    transform,
  };
}

function transformAlphabetCharacter(character: string, spec: AlphabetSpec, unsupportedMode: UnsupportedMode): string {
  const exception = spec.exceptions?.[character];
  if (exception) return exception;

  const digitException = spec.digitExceptions?.[character];
  if (digitException) return digitException;

  if (character === ' ' && spec.space) return spec.space;

  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return '';

  if (spec.upper !== undefined && codePoint >= 0x41 && codePoint <= 0x5a) {
    return String.fromCodePoint(spec.upper + codePoint - 0x41);
  }

  if (spec.lower !== undefined && codePoint >= 0x61 && codePoint <= 0x7a) {
    return String.fromCodePoint(spec.lower + codePoint - 0x61);
  }

  if (spec.digit !== undefined && codePoint >= 0x30 && codePoint <= 0x39) {
    return String.fromCodePoint(spec.digit + codePoint - 0x30);
  }

  return unsupportedMode === 'omit' ? '' : character;
}
