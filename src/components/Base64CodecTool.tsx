import { useEffect, useMemo, useState } from 'react';
import { type Locale } from '@/i18n/config';
import { t } from '@/i18n/ui';
import { localize } from '@/i18n/utils';
import { copyTextToClipboard, readTextFromClipboard } from '@/lib/clipboard';
import { toolLocalStorageKey } from '@/lib/local/storage-contract';
import { base64Ui } from '@/tools/base64-codec/ui';
import { run, type Base64CodecInput, type Base64CodecOutput } from '@/tools/base64-codec/run';

type Base64CodecToolProps = {
  locale: Locale;
};

const MODE_STORAGE_KEY = toolLocalStorageKey('base64-codec', 'settings', 'mode');
const defaultInput: Base64CodecInput = {
  text: '',
  mode: 'encode',
  encoding: 'utf-8',
  urlSafe: false,
  wrap: false,
};

export default function Base64CodecTool({ locale }: Base64CodecToolProps) {
  const [input, setInput] = useState<Base64CodecInput>(defaultInput);
  const [output, setOutput] = useState<Base64CodecOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [clipboardState, setClipboardState] = useState<'idle' | 'loaded' | 'failed'>('idle');

  useEffect(() => {
    const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);

    if (storedMode === 'encode' || storedMode === 'decode') {
      setInput((current) => ({ ...current, mode: storedMode }));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, input.mode);
  }, [input.mode]);

  useEffect(() => {
    setCopyState('idle');

    if (!input.text) {
      setOutput(null);
      setError(null);
      return;
    }

    try {
      setOutput(run(input));
      setError(null);
    } catch (runError) {
      setOutput(null);
      setError(runError instanceof Error ? runError.message : String(runError));
    }
  }, [input]);

  const inputBytes = useMemo(() => {
    if (!input.text) return 0;

    try {
      return run({ ...input, text: input.text }).inputBytes;
    } catch {
      return input.text.replace(/\s+/g, '').length;
    }
  }, [input]);

  function updateInput(patch: Partial<Base64CodecInput>) {
    setClipboardState('idle');
    setInput((current) => ({ ...current, ...patch }));
  }

  function handleReset() {
    setInput((current) => ({ ...defaultInput, mode: current.mode }));
    setOutput(null);
    setError(null);
    setCopyState('idle');
    setClipboardState('idle');
  }

  async function handleReadClipboard() {
    const text = await readTextFromClipboard();

    if (text === null) {
      setClipboardState('failed');
      return;
    }

    setInput((current) => ({ ...current, text }));
    setClipboardState('loaded');
  }

  async function handleCopy() {
    if (!output?.text) return;

    const copied = await copyTextToClipboard(output.text);
    setCopyState(copied ? 'copied' : 'failed');
  }

  return (
    <div className="base64-codec">
      <section className="panel base64-panel base64-input-panel">
        <div className="section-heading base64-panel-heading">
          <div>
            <h2>{t(locale, 'toolInput')}</h2>
            <p>{localize(base64Ui.inputNote, locale)}</p>
          </div>
          <div className="base64-heading-actions">
            <span>
              {inputBytes} {localize(base64Ui.bytes, locale)}
            </span>
            <button type="button" onClick={() => void handleReadClipboard()}>
              {clipboardState === 'loaded'
                ? localize(base64Ui.clipboardLoaded, locale)
                : clipboardState === 'failed'
                  ? localize(base64Ui.clipboardReadFailed, locale)
                  : localize(base64Ui.readClipboard, locale)}
            </button>
            <button type="button" onClick={handleReset}>
              {t(locale, 'toolReset')}
            </button>
          </div>
        </div>

        <div className="base64-mode-control" role="group" aria-label={localize(base64Ui.mode, locale)}>
          {(['encode', 'decode'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={input.mode === mode ? 'base64-mode-button base64-mode-button--active' : 'base64-mode-button'}
              aria-pressed={input.mode === mode}
              onClick={() => updateInput({ mode })}
            >
              {localize(mode === 'encode' ? base64Ui.encode : base64Ui.decode, locale)}
            </button>
          ))}
        </div>

        <textarea
          className="base64-textarea"
          value={input.text}
          placeholder={localize(input.mode === 'encode' ? base64Ui.placeholderEncode : base64Ui.placeholderDecode, locale)}
          onChange={(event) => updateInput({ text: event.currentTarget.value })}
        />

        <OptionsPanel input={input} locale={locale} onChange={updateInput} />
      </section>

      <section className="panel base64-panel base64-output-panel">
        <div className="section-heading output-heading base64-panel-heading">
          <div>
            <h2>{t(locale, 'toolOutput')}</h2>
            <p>{localize(base64Ui.outputNote, locale)}</p>
          </div>
          <button type="button" onClick={handleCopy} disabled={!output?.text}>
            {copyState === 'copied' ? localize(base64Ui.copied, locale) : copyState === 'failed' ? localize(base64Ui.copyFailed, locale) : t(locale, 'toolCopyResult')}
          </button>
        </div>

        {error ? (
          <div className="error-panel base64-error" role="alert">
            <strong>{t(locale, 'toolError')}</strong>
            <p>{error}</p>
          </div>
        ) : output?.text ? (
          <pre className="result-box base64-result-box">{output.text}</pre>
        ) : (
          <div className="empty-result base64-empty-result">{localize(base64Ui.emptyOutput, locale)}</div>
        )}

        <div className="base64-status-strip">
          <span>
            {localize(base64Ui.inputBytes, locale)}: {output?.inputBytes ?? inputBytes} {localize(base64Ui.bytes, locale)}
          </span>
          <span>
            {localize(base64Ui.outputChars, locale)}: {output?.outputCharacters ?? 0} {localize(base64Ui.chars, locale)}
          </span>
          <span>
            {localize(base64Ui.mode, locale)}: {localize(input.mode === 'encode' ? base64Ui.encode : base64Ui.decode, locale)}
          </span>
        </div>
      </section>
    </div>
  );
}

function OptionsPanel({
  input,
  locale,
  onChange,
}: {
  input: Base64CodecInput;
  locale: Locale;
  onChange: (patch: Partial<Base64CodecInput>) => void;
}) {
  return (
    <>
      <div className="base64-options base64-options--desktop">
        <OptionsBody input={input} locale={locale} onChange={onChange} />
      </div>
      <details className="base64-options base64-options--mobile">
        <summary>{localize(base64Ui.options, locale)}</summary>
        <OptionsBody input={input} locale={locale} onChange={onChange} />
      </details>
    </>
  );
}

function OptionsBody({
  input,
  locale,
  onChange,
}: {
  input: Base64CodecInput;
  locale: Locale;
  onChange: (patch: Partial<Base64CodecInput>) => void;
}) {
  return (
    <div className="base64-options-body">
      <label className="base64-option-row">
        <span>{localize(base64Ui.encoding, locale)}</span>
        <select value={input.encoding} onChange={(event) => onChange({ encoding: event.currentTarget.value as Base64CodecInput['encoding'] })}>
          <option value="utf-8">UTF-8</option>
          <option value="latin1">Latin-1</option>
        </select>
      </label>
      <label className="base64-switch-row">
        <span>{localize(base64Ui.urlSafe, locale)}</span>
        <input type="checkbox" checked={input.urlSafe} onChange={(event) => onChange({ urlSafe: event.currentTarget.checked })} />
      </label>
      <label className="base64-switch-row">
        <span>{localize(base64Ui.wrap, locale)}</span>
        <input type="checkbox" checked={input.wrap} onChange={(event) => onChange({ wrap: event.currentTarget.checked })} />
      </label>
    </div>
  );
}
