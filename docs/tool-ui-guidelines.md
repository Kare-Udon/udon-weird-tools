# Tool UI Guidelines

Use this file before adding a tool, changing a tool schema, or editing the tool detail UI. The goal is a consistent, quiet, usable interface on desktop and mobile.

## Tone

- Keep the site text-first, light blue, and low decoration.
- Keep visible explanatory copy sparse. If context is useful but not necessary to operate the tool, hide it behind hover text, a tooltip, or another quiet help affordance.
- Do not add marketing heroes, large illustrations, gradients, or heavy shadows.
- Treat each tool page as a workbench: input, actions, and output should be clear.
- Desktop can use two panels. Mobile must be single column with safe side padding.

## Page Structure

Each tool page should include:

1. Tool metadata: category, status, version, title, description, tags.
2. Input panel: title, privacy note, fields.
3. Action row: run, reset, example.
4. Output panel: title, saved-state note, copy action, result or empty state.

Reuse the shared layout unless the tool truly needs custom interaction.

## Fields

- Place labels above controls.
- Text inputs, selects, and textareas should share width, radius, border, and focus styles.
- Checkboxes and radios must not inherit full-width input styles.
- Checkbox rows should be `control + label`, with stable alignment and touch area.
- Keep vertical spacing between checkbox or radio rows.
- Long placeholders must not break mobile layout.
- File-upload helper text should not be a visible paragraph by default; prefer hover/help affordances for limits, privacy notes, and edge-case details.

## Actions

- Keep clear spacing between fields and the action row.
- Use one primary button, usually `Run`.
- For file-upload tools, auto-run immediately after a file is selected and do not show a separate `Run` button.
- Keep secondary buttons visually quieter.
- Mobile buttons may wrap, but text must not overflow or distort button height.
- Long example labels should wrap naturally or take more width.

## Output

- Empty states need stable height.
- Errors should stay inside or near the output area.
- Results should use monospace where useful.
- Long results must wrap or scroll without widening the page.
- Show the copy button only when a result exists.

## Browser Storage Contract

Use this contract for any tool data that should be visible and deletable in Storage Manager. Do not invent one-off localStorage keys, IndexedDB names, Cache Storage names, or OPFS directory layouts.

Tool `run.ts` files must remain pure and must not access browser storage directly. Storage writes belong in React islands or shared browser-side helpers under `src/lib/local/`.

Use `src/lib/local/storage-contract.ts` to build storage names and paths:

```ts
toolLocalStorageKey(toolSlug, 'data', entryId);
toolLocalStorageKey(toolSlug, 'settings', entryId);
toolIndexedDbName(toolSlug);
toolCacheName(toolSlug);
toolModelCachePath(toolSlug, modelId, relativePath);
toolOpfsModelPath(toolSlug, modelId, relativePath);
```

Required ownership rules:

- `toolSlug` must be the manifest slug. This is how Storage Manager groups data by tool.
- `entryId` names one deletable database item, for example `recent-run`, `favorite-results`, or `draft-input`.
- `modelId` names the whole model, not an individual file. Use values like `moonshine-tiny-en` or `Kokoro-82M-v1.0-ONNX`; do not use `model.onnx`, `tokenizer.json`, `voices`, or `main`.
- `relativePath` is the file path inside that model group, for example `onnx/model.onnx` or `voices/af_heart.bin`.

Storage layouts:

- localStorage keys: `weird-tools:tool:<tool-slug>:data:<entry-id>` or `weird-tools:tool:<tool-slug>:settings:<entry-id>`.
- IndexedDB database names: `weird-tools:tool:<tool-slug>`. Store names should describe the data class, such as `data`, `settings`, or `models`.
- Cache Storage names: `weird-tools:tool:<tool-slug>:files`. Cache model files under synthetic same-origin request paths from `toolModelCachePath()`, not under the original remote URL.
- OPFS model files: `tools/<tool-slug>/models/<model-id>/<relative-path>`.

Deletion boundaries:

- Database deletion removes one entry only.
- File deletion removes the whole `modelId` group for a tool.
- Storage Manager only classifies data that follows this contract. Legacy or ad hoc storage is not guessed into a tool group.

## Mobile Check

Check at mobile width:

- Side padding is not cramped.
- Header wraps without covering content.
- Controls do not touch the viewport edge.
- Checkboxes and radios keep normal size and alignment.
- The action row has space above it.
- Empty output is stable, not collapsed or oversized.

## Desktop Check

Check at desktop width:

- Input and output panels feel balanced.
- Titles, panels, and fields align on a clear axis.
- Header position does not jump when switching views or pages.
- Dividers, borders, and tag colors stay consistent.

## New Tool Flow

1. Read this file before writing schema or UI.
2. Reuse `ToolPlayground` and global form styles.
3. Do not copy button, checkbox, or panel styles into one tool.
4. If a field type is missing, consider adding it to the shared renderer.
5. Run:

```bash
npm run validate:tools
ASTRO_TELEMETRY_DISABLED=1 npm run typecheck
ASTRO_TELEMETRY_DISABLED=1 npm run build
```

6. If UI changed, inspect desktop and mobile in the local browser.

## Common Mistakes

- Full-width input styles affecting checkboxes.
- Action rows touching the last field.
- Mobile layout that only fits, but is not comfortable.
- Long button text squeezing nearby buttons.
- Empty output areas changing page height too much.
- One tool overriding shared visual rules.
