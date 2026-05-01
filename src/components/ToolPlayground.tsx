import { useEffect, useMemo, useState } from 'react';
import { type Locale } from '@/i18n/config';
import { t } from '@/i18n/ui';
import { localize } from '@/i18n/utils';
import { saveRecentRun } from '@/lib/local/recent';
import { assertSerializable, stringifyResult } from '@/lib/runtime/serializable';
import { loadClientTool } from '@/tools/client-registry';
import type { ToolField, ToolModule } from '@/tools/_types';

type ToolPlaygroundProps = {
  slug: string;
  locale: Locale;
};

type FormValues = Record<string, string | number | boolean>;

export default function ToolPlayground({ slug, locale }: ToolPlaygroundProps) {
  const [module, setModule] = useState<ToolModule<any, unknown> | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [output, setOutput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    loadClientTool(slug)
      .then((loaded) => {
        if (cancelled) return;
        setModule(loaded);
        setValues(getInitialValues(loaded.inputFields));
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const resultText = useMemo(() => (output === null ? '' : stringifyResult(output)), [output]);

  async function handleRun() {
    if (!module) return;

    setRunning(true);
    setError(null);
    setCopied(false);

    try {
      const normalizedValues = normalizeValues(module.inputFields, values);
      const result = await module.run(normalizedValues, {
        locale,
        now: () => new Date(),
      });

      assertSerializable(result);
      setOutput(result);
      saveRecentRun({
        slug,
        at: new Date().toISOString(),
        input: normalizedValues,
        output: result,
      });
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setRunning(false);
    }
  }

  function handleReset() {
    if (!module) return;
    setValues(getInitialValues(module.inputFields));
    setOutput(null);
    setError(null);
    setCopied(false);
  }

  function handleUseExample() {
    const example = module?.examples[0];
    if (!example) return;
    setValues(example.input as FormValues);
    setOutput(null);
    setError(null);
    setCopied(false);
  }

  async function handleCopy() {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
  }

  if (loading) {
    return <div className="panel muted-panel">{t(locale, 'toolLoading')}</div>;
  }

  if (!module) {
    return <div className="panel error-panel">{error ?? t(locale, 'toolError')}</div>;
  }

  return (
    <div className="tool-playground">
      <section className="panel">
        <div className="section-heading">
          <h2>{t(locale, 'toolInput')}</h2>
          <p>{t(locale, 'toolLocalOnly')}</p>
        </div>

        <div className="form-stack">
          {module.inputFields.map((field) => (
            <FieldRenderer
              key={field.name}
              field={field}
              locale={locale}
              value={values[field.name]}
              onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
            />
          ))}
        </div>

        <div className="button-row">
          <button type="button" className="primary" onClick={handleRun} disabled={running}>
            {running ? t(locale, 'toolRunning') : t(locale, 'toolRun')}
          </button>
          <button type="button" onClick={handleReset} disabled={running}>
            {t(locale, 'toolReset')}
          </button>
          {module.examples.length > 0 && (
            <button type="button" onClick={handleUseExample} disabled={running}>
              {t(locale, 'toolUseExample')}: {localize(module.examples[0].name, locale)}
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading output-heading">
          <div>
            <h2>{t(locale, 'toolOutput')}</h2>
            <p>{t(locale, 'toolRecentSaved')}</p>
          </div>
          {resultText && (
            <button type="button" onClick={handleCopy}>
              {copied ? '✓' : t(locale, 'toolCopyResult')}
            </button>
          )}
        </div>

        {error && (
          <div className="error-panel" role="alert">
            <strong>{t(locale, 'toolError')}</strong>
            <p>{error}</p>
          </div>
        )}

        {resultText ? <pre className="result-box">{resultText}</pre> : <div className="empty-result">{t(locale, 'toolNoOutput')}</div>}
      </section>
    </div>
  );
}

function FieldRenderer({
  field,
  locale,
  value,
  onChange,
}: {
  field: ToolField;
  locale: Locale;
  value: FormValues[string] | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  const id = `field-${field.name}`;
  const helper = field.helperText?.[locale];

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{localize(field.label, locale)}</span>

      {field.type === 'textarea' && (
        <textarea
          id={id}
          rows={field.rows ?? 8}
          required={field.required}
          value={String(value ?? '')}
          placeholder={field.placeholder?.[locale] ?? ''}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}

      {field.type === 'text' && (
        <input
          id={id}
          type="text"
          required={field.required}
          value={String(value ?? '')}
          placeholder={field.placeholder?.[locale] ?? ''}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}

      {field.type === 'number' && (
        <input
          id={id}
          type="number"
          required={field.required}
          value={Number(value ?? field.defaultValue ?? 0)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
      )}

      {field.type === 'select' && (
        <select id={id} value={String(value ?? field.defaultValue ?? '')} onChange={(event) => onChange(event.currentTarget.value)}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {localize(option.label, locale)}
            </option>
          ))}
        </select>
      )}

      {field.type === 'checkbox' && (
        <span className="checkbox-line">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value ?? field.defaultValue ?? false)}
            onChange={(event) => onChange(event.currentTarget.checked)}
          />
          <span>{localize(field.label, locale)}</span>
        </span>
      )}

      {helper && <span className="field-help">{helper}</span>}
    </label>
  );
}

function getInitialValues(fields: readonly ToolField[]): FormValues {
  return Object.fromEntries(
    fields.map((field) => {
      if ('defaultValue' in field && field.defaultValue !== undefined) {
        return [field.name, field.defaultValue];
      }

      if (field.type === 'checkbox') return [field.name, false];
      if (field.type === 'number') return [field.name, 0];
      if (field.type === 'select') return [field.name, field.options[0]?.value ?? ''];
      return [field.name, ''];
    }),
  );
}

function normalizeValues(fields: readonly ToolField[], values: FormValues): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = values[field.name];

      if (field.type === 'number') {
        return [field.name, Number(value ?? field.defaultValue ?? 0)];
      }

      if (field.type === 'checkbox') {
        return [field.name, Boolean(value ?? field.defaultValue ?? false)];
      }

      return [field.name, value ?? ''];
    }),
  );
}
