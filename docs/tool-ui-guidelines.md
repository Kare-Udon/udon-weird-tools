# Tool UI Guidelines

Use this file before adding a tool, changing a tool schema, or editing the tool detail UI. The goal is a consistent, quiet, usable interface on desktop and mobile.

## Tone

- Keep the site text-first, light blue, and low decoration.
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

## Actions

- Keep clear spacing between fields and the action row.
- Use one primary button, usually `Run`.
- Keep secondary buttons visually quieter.
- Mobile buttons may wrap, but text must not overflow or distort button height.
- Long example labels should wrap naturally or take more width.

## Output

- Empty states need stable height.
- Errors should stay inside or near the output area.
- Results should use monospace where useful.
- Long results must wrap or scroll without widening the page.
- Show the copy button only when a result exists.

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
