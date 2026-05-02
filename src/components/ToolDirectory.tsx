import { useMemo, useState } from 'react';
import type { Locale } from '@/i18n/config';

type ToolDirectoryItem = {
  slug: string;
  href: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
};

type ToolDirectoryLabels = {
  title: string;
  searchPlaceholder: string;
  viewLabel: string;
  listView: string;
  cardView: string;
  compactView: string;
  countSuffix: string;
  nameColumn: string;
  categoryColumn: string;
  tagsColumn: string;
};

type ViewMode = 'list' | 'card' | 'compact';

type ToolDirectoryProps = {
  locale: Locale;
  tools: ToolDirectoryItem[];
  labels: ToolDirectoryLabels;
};

const viewModes: Array<{ id: ViewMode; labelKey: keyof ToolDirectoryLabels }> = [
  { id: 'list', labelKey: 'listView' },
  { id: 'card', labelKey: 'cardView' },
  { id: 'compact', labelKey: 'compactView' },
];

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      <path d="m20 20-4.2-4.2" />
      <circle cx="10.8" cy="10.8" r="6.2" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

function matchesSearch(tool: ToolDirectoryItem, query: string): boolean {
  if (!query) return true;

  const haystack = [tool.name, tool.description, tool.category, ...tool.tags].join(' ').toLowerCase();
  return haystack.includes(query);
}

export default function ToolDirectory({ tools, labels }: ToolDirectoryProps) {
  const [view, setView] = useState<ViewMode>('list');
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTools = useMemo(
    () => tools.filter((tool) => matchesSearch(tool, normalizedQuery)),
    [normalizedQuery, tools],
  );

  const countText = `${filteredTools.length} ${labels.countSuffix}`;

  return (
    <section className={`tool-directory tool-directory--${view}`} aria-labelledby="tool-directory-title">
      <div className="directory-heading">
        <h1 id="tool-directory-title">{labels.title}</h1>
      </div>

      <div className="directory-control-strip">
        <label className="directory-search">
          <span className="search-glyph">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            placeholder={labels.searchPlaceholder}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        <div className="directory-toolbar" aria-label={labels.viewLabel}>
          <span>{labels.viewLabel}</span>
          <div className="view-switcher">
            {viewModes.map((item) => (
              <button
                key={item.id}
                type="button"
                className={view === item.id ? 'active' : undefined}
                onClick={() => setView(item.id)}
                aria-pressed={view === item.id}
              >
                {labels[item.labelKey]}
              </button>
            ))}
          </div>
        </div>

        <span className="directory-count">{countText}</span>
      </div>

      {view === 'compact' ? (
        <div className="compact-table" role="table" aria-label={labels.title}>
          <div className="compact-table-header" role="row">
            <span role="columnheader">{labels.nameColumn}</span>
            <span role="columnheader">{labels.categoryColumn}</span>
            <span role="columnheader">{labels.tagsColumn}</span>
            <span role="columnheader" aria-hidden="true"></span>
          </div>
          <div className="compact-table-body">
            {filteredTools.map((tool) => (
              <a className="tool-row tool-row--compact" href={tool.href} key={tool.slug} role="row">
                <span className="compact-name" role="cell">
                  {tool.name}
                  <small>{tool.description}</small>
                </span>
                <span role="cell">
                  <span className="category-pill">{tool.category}</span>
                </span>
                <span className="compact-tags" role="cell">
                  {tool.tags.map((tag) => (
                    <span className="tag-pill" key={tag}>
                      {tag}
                    </span>
                  ))}
                </span>
                <span className="row-arrow" role="cell" aria-hidden="true">
                  <ArrowIcon />
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div className={view === 'card' ? 'tool-card-grid' : 'tool-list'}>
          {filteredTools.map((tool) => (
            <a className={view === 'card' ? 'directory-card' : 'tool-row'} href={tool.href} key={tool.slug}>
              <div className="tool-content">
                <div className="tool-kicker">
                  <span className="category-pill">{tool.category}</span>
                  {tool.tags.slice(0, view === 'card' ? 4 : 5).map((tag) => (
                    <span className="tag-pill" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <h2>{tool.name}</h2>
                <p>{tool.description}</p>
              </div>
              <span className="row-arrow" aria-hidden="true">
                <ArrowIcon />
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
