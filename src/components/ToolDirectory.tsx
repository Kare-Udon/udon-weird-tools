import { useMemo, useState } from 'react';
import type { Locale } from '@/i18n/config';

type ToolDirectoryStatus = 'stable' | 'experimental';

type ToolDirectoryItem = {
  slug: string;
  href: string;
  name: string;
  description: string;
  category: string;
  categoryRank: number;
  status: ToolDirectoryStatus;
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
  sortLabel: string;
  sortNameAsc: string;
  sortNameDesc: string;
  sortCategory: string;
  sortStatus: string;
};

type ViewMode = 'list' | 'card' | 'compact';
type SortMode = 'name-asc' | 'name-desc' | 'category' | 'status';

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

const sortModes: Array<{ id: SortMode; labelKey: keyof ToolDirectoryLabels }> = [
  { id: 'name-asc', labelKey: 'sortNameAsc' },
  { id: 'name-desc', labelKey: 'sortNameDesc' },
  { id: 'category', labelKey: 'sortCategory' },
  { id: 'status', labelKey: 'sortStatus' },
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

function compareByName(a: ToolDirectoryItem, b: ToolDirectoryItem, collator: Intl.Collator): number {
  const nameComparison = collator.compare(a.name, b.name);
  if (nameComparison !== 0) return nameComparison;

  return collator.compare(a.slug, b.slug);
}

function compareByStatus(a: ToolDirectoryItem, b: ToolDirectoryItem): number {
  const statusRank: Record<ToolDirectoryStatus, number> = {
    stable: 0,
    experimental: 1,
  };

  return statusRank[a.status] - statusRank[b.status];
}

function sortTools(tools: ToolDirectoryItem[], sortMode: SortMode, locale: Locale): ToolDirectoryItem[] {
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: 'base',
  });

  return [...tools].sort((a, b) => {
    if (sortMode === 'name-desc') {
      return compareByName(b, a, collator);
    }

    if (sortMode === 'category') {
      const categoryComparison = a.categoryRank - b.categoryRank;
      if (categoryComparison !== 0) return categoryComparison;
      return compareByName(a, b, collator);
    }

    if (sortMode === 'status') {
      const statusComparison = compareByStatus(a, b);
      if (statusComparison !== 0) return statusComparison;
      return compareByName(a, b, collator);
    }

    return compareByName(a, b, collator);
  });
}

export default function ToolDirectory({ locale, tools, labels }: ToolDirectoryProps) {
  const [view, setView] = useState<ViewMode>('list');
  const [sort, setSort] = useState<SortMode>('name-asc');
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTools = useMemo(
    () => sortTools(tools.filter((tool) => matchesSearch(tool, normalizedQuery)), sort, locale),
    [locale, normalizedQuery, sort, tools],
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

        <label className="directory-control-field">
          <span>{labels.sortLabel}</span>
          <select value={sort} onChange={(event) => setSort(event.currentTarget.value as SortMode)}>
            {sortModes.map((item) => (
              <option key={item.id} value={item.id}>
                {labels[item.labelKey]}
              </option>
            ))}
          </select>
        </label>

        <label className="directory-control-field">
          <span>{labels.viewLabel}</span>
          <select value={view} onChange={(event) => setView(event.currentTarget.value as ViewMode)}>
            {viewModes.map((item) => (
              <option key={item.id} value={item.id}>
                {labels[item.labelKey]}
              </option>
            ))}
          </select>
        </label>

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
