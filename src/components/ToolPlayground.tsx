import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const FAVORITE_RESULTS_PREFIX = 'weird-tools:favorite-results:';

export default function ToolPlayground({ slug, locale }: ToolPlaygroundProps) {
  const autoPreview = slug === 'unicode-fancy-text';
  const [module, setModule] = useState<ToolModule<any, unknown> | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [output, setOutput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [visibleResultCount, setVisibleResultCount] = useState(12);
  const [favoriteItemIds, setFavoriteItemIds] = useState<string[]>([]);

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

  useEffect(() => {
    if (!autoPreview || typeof window === 'undefined') return;

    const raw = window.localStorage.getItem(`${FAVORITE_RESULTS_PREFIX}${slug}`);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
        setFavoriteItemIds(parsed);
      }
    } catch {
      setFavoriteItemIds([]);
    }
  }, [autoPreview, slug]);

  const resultText = useMemo(() => (output === null ? '' : stringifyResult(output)), [output]);

  useEffect(() => {
    if (!autoPreview || !module) return;

    const normalizedValues = normalizeValues(module.inputFields, values);
    const text = typeof normalizedValues.text === 'string' ? normalizedValues.text : '';

    setCopied(false);
    setCopiedItemId(null);
    setVisibleResultCount(12);

    if (!text.trim()) {
      setOutput(null);
      setError(null);
      setRunning(false);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setRunning(true);
      setError(null);

      try {
        const result = await module.run(normalizedValues, {
          locale,
          now: () => new Date(),
        });

        assertSerializable(result);
        setOutput(result);
      } catch (runError) {
        setOutput(null);
        setError(runError instanceof Error ? runError.message : String(runError));
      } finally {
        setRunning(false);
      }
    }, 80);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [autoPreview, locale, module, values]);

  async function handleRun() {
    if (!module) return;

    setRunning(true);
    setError(null);
    setCopied(false);
    setCopiedItemId(null);
    setVisibleResultCount(12);

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
    setCopiedItemId(null);
    setVisibleResultCount(12);
  }

  function handleUseExample() {
    const example = module?.examples[0];
    if (!example) return;
    setValues(example.input as FormValues);
    setOutput(null);
    setError(null);
    setCopied(false);
    setCopiedItemId(null);
    setVisibleResultCount(12);
  }

  async function handleCopy() {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
  }

  async function handleCopyItem(itemId: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedItemId(itemId);
  }

  const handleShowMore = useCallback(() => {
    setVisibleResultCount((current) => current + 12);
  }, []);

  const handleToggleFavorite = useCallback(
    (itemId: string) => {
      setFavoriteItemIds((current) => {
        const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId];

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(`${FAVORITE_RESULTS_PREFIX}${slug}`, JSON.stringify(next));
        }

        return next;
      });
      setVisibleResultCount(12);
    },
    [slug],
  );

  if (loading) {
    return <div className="panel muted-panel">{t(locale, 'toolLoading')}</div>;
  }

  if (!module) {
    return <div className="panel error-panel">{error ?? t(locale, 'toolError')}</div>;
  }

  return (
    <div className={autoPreview ? 'tool-playground tool-playground--auto-preview' : 'tool-playground'}>
      <section className="panel">
        {!autoPreview && (
          <div className="section-heading">
            <h2>{t(locale, 'toolInput')}</h2>
            <p>{t(locale, 'toolLocalOnly')}</p>
          </div>
        )}

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

        {!autoPreview && (
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
        )}
      </section>

      <section className="panel">
        {(!autoPreview || resultText) && (
          <div className="section-heading output-heading">
            {!autoPreview && (
              <div>
                <h2>{t(locale, 'toolOutput')}</h2>
                <p>{t(locale, 'toolRecentSaved')}</p>
              </div>
            )}
            {resultText && (
              <button type="button" onClick={handleCopy}>
                {copied ? '✓' : t(locale, 'toolCopyResult')}
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="error-panel" role="alert">
            <strong>{t(locale, 'toolError')}</strong>
            <p>{error}</p>
          </div>
        )}

        {resultText ? (
          <ResultRenderer
            output={output}
            locale={locale}
            visibleResultCount={visibleResultCount}
            copiedItemId={copiedItemId}
            autoLoad={autoPreview}
            favoriteItemIds={favoriteItemIds}
            onToggleFavorite={autoPreview ? handleToggleFavorite : undefined}
            onCopyItem={handleCopyItem}
            onShowMore={handleShowMore}
          />
        ) : (
          <div className="empty-result">{t(locale, 'toolNoOutput')}</div>
        )}
      </section>
    </div>
  );
}

type CollectionResult = {
  items: Array<{
    id?: string;
    name?: unknown;
    category?: unknown;
    text: string;
  }>;
};

function ResultRenderer({
  output,
  locale,
  visibleResultCount,
  copiedItemId,
  autoLoad,
  favoriteItemIds,
  onToggleFavorite,
  onCopyItem,
  onShowMore,
}: {
  output: unknown;
  locale: Locale;
  visibleResultCount: number;
  copiedItemId: string | null;
  autoLoad: boolean;
  favoriteItemIds: string[];
  onToggleFavorite?: (itemId: string) => void;
  onCopyItem: (itemId: string, text: string) => void;
  onShowMore: () => void;
}) {
  if (!isCollectionResult(output)) {
    return <pre className="result-box">{stringifyResult(output)}</pre>;
  }

  return (
    <CollectionResultRenderer
      output={output}
      locale={locale}
      visibleResultCount={visibleResultCount}
      copiedItemId={copiedItemId}
      autoLoad={autoLoad}
      favoriteItemIds={favoriteItemIds}
      onToggleFavorite={onToggleFavorite}
      onCopyItem={onCopyItem}
      onShowMore={onShowMore}
    />
  );
}

function CollectionResultRenderer({
  output,
  locale,
  visibleResultCount,
  copiedItemId,
  autoLoad,
  favoriteItemIds,
  onToggleFavorite,
  onCopyItem,
  onShowMore,
}: {
  output: CollectionResult;
  locale: Locale;
  visibleResultCount: number;
  copiedItemId: string | null;
  autoLoad: boolean;
  favoriteItemIds: string[];
  onToggleFavorite?: (itemId: string) => void;
  onCopyItem: (itemId: string, text: string) => void;
  onShowMore: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const favoriteSet = useMemo(() => new Set(favoriteItemIds), [favoriteItemIds]);
  const orderedItems = useMemo(() => {
    return [...output.items].sort((left, right) => {
      const leftFavorite = favoriteSet.has(left.id ?? '');
      const rightFavorite = favoriteSet.has(right.id ?? '');

      if (leftFavorite === rightFavorite) return 0;
      return leftFavorite ? -1 : 1;
    });
  }, [favoriteSet, output.items]);

  const visibleItems = orderedItems.slice(0, visibleResultCount);
  const hasMore = visibleItems.length < orderedItems.length;

  useEffect(() => {
    if (!autoLoad || !hasMore || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onShowMore();
        }
      },
      { rootMargin: '520px 0px' },
    );

    observer.observe(sentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [autoLoad, hasMore, onShowMore, visibleResultCount]);

  return (
    <div className="result-collection">
      <div className="result-collection-summary">
        {output.items.length} {t(locale, 'toolResultCount')}
      </div>

      <div className="result-list">
        {visibleItems.map((item, index) => {
          const itemId = item.id ?? `result-${index}`;
          const isFavorite = favoriteSet.has(itemId);

          return (
            <article className={isFavorite ? 'result-item result-item--favorite' : 'result-item'} key={itemId}>
              <div className="result-item-heading">
                <div>
                  <h3>{localizeMaybe(item.name, locale) || itemId}</h3>
                  {localizeMaybe(item.category, locale) && <p>{localizeMaybe(item.category, locale)}</p>}
                </div>
                <div className="result-item-actions">
                  {onToggleFavorite && (
                    <button type="button" onClick={() => onToggleFavorite(itemId)}>
                      {isFavorite ? t(locale, 'toolUnfavoriteItem') : t(locale, 'toolFavoriteItem')}
                    </button>
                  )}
                  <button type="button" onClick={() => onCopyItem(itemId, item.text)}>
                    {copiedItemId === itemId ? '✓' : t(locale, 'toolCopyItem')}
                  </button>
                </div>
              </div>
              <pre>{item.text}</pre>
            </article>
          );
        })}
      </div>

      {hasMore && autoLoad && <div ref={sentinelRef} className="result-load-sentinel" aria-hidden="true" />}

      {hasMore && !autoLoad && (
        <button type="button" className="load-more-button" onClick={onShowMore}>
          {t(locale, 'toolShowMore')}
        </button>
      )}
    </div>
  );
}

function isCollectionResult(value: unknown): value is CollectionResult {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    Array.isArray((value as { items: unknown }).items) &&
    (value as { items: unknown[] }).items.every((item) => {
      return Boolean(item) && typeof item === 'object' && item !== null && 'text' in item && typeof (item as { text: unknown }).text === 'string';
    })
  );
}

function localizeMaybe(value: unknown, locale: Locale): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';

  const localized = value as Partial<Record<Locale, string>>;
  const fallback = localized[locale] ?? localized.en ?? localized['zh-CN'] ?? Object.values(localized).find((entry): entry is string => typeof entry === 'string');
  return fallback ?? '';
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
