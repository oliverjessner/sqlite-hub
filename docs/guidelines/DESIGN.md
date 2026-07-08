# SQLite Hub UI Rules for Codex

Follow these rules exactly when creating or modifying UI controls.

1. Reuse existing shared components before creating anything new.
2. Use exactly one semantic main class per control.
3. Never combine multiple primary button-style classes (`standard-button`, `signature-button`, `delete-button`) on the same element.
4. View-specific classes may change layout, width, spacing, or position only.
5. View-specific classes must not redefine the base style of shared components.
6. The standard height for buttons and compact interactive controls is `32px`.
7. The source of truth for button height is `--button-height` in `frontend/styles/tokens.css`.
8. The source of truth for form control height is `--control-height` in `frontend/styles/tokens.css`.
9. Controls in the same row must have the same height unless one is a text input or textarea.
10. All regular buttons must use one of these base classes only: `standard-button`, `signature-button`, `delete-button`.
11. Use `standard-button` for normal actions.
12. Use `signature-button` only for the primary yellow CTA in a context.
13. Use `delete-button` only for destructive actions.
14. Delete buttons must show the `delete` Material Symbol before the text label.
15. `signature-button` must keep its hover state and chamfered corner.
16. All visible clickable buttons must have a hover state.
17. Disabled states must come from the shared component, not from local view CSS.
18. Dropdown toggles may combine a base button class with `dropdown-button__toggle`; that class may only control dropdown layout and open-state behavior.
19. Visibility/toggle buttons may combine a base button class with `panel-toggle-button`; that class is the shared toggle-state modifier.
20. All reusable checkboxes must use `standard-checkbox`.
21. Do not build feature-specific checkbox shells or checkbox base styles.
22. Inputs and selects must follow the shared base rules in `frontend/styles/base.css`.
23. Ghost or transparent inputs must not use a white background, including unfocused state.
24. When a new control pattern appears in multiple places, promote it to a shared component first, then migrate existing usages.

## Source of Truth

- `frontend/styles/tokens.css`
- `frontend/styles/base.css`
- `frontend/index.html`

## Default Decision Rules

- Prefer reuse over invention.
- Prefer migration over local override.
- Prefer shared component updates over per-view fixes.

## Multi-Pick Dropdowns

- Use this pattern for compact filters where the user can select multiple values, such as `TAGS`.
- Use `details.dropdown-button` with a `standard-button dropdown-button__toggle` summary.
- The toggle must have a fixed or bounded responsive width; it must not grow with long selected values.
- The toggle label must be wrapped in its own label span with `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`.
- The toggle must keep a mandatory left inset. Do not rely only on inherited button padding; set explicit left padding on the pattern class when needed.
- The chevron must remain visible for all selected labels.
- Put the full selected label in `title` when the visible label may truncate.
- The dropdown panel must have visible inner padding. Header text, checkbox rows, and footer actions must never touch the panel edge.
- Multi-pick rows must use a stable grid: checkbox, truncated label, optional count.
- Row labels should follow the existing technical style: mono, uppercase, compact, and muted until hover or active state.
- Counts belong on the right edge and must not compress the label into the checkbox.
- The reset action belongs in a compact footer row, visually secondary to the selected values.
- Do not use native `<select multiple>` for this app UI.

## UX behavior

- All drawers must close with `Escape`.
- All modal windows must close with `Escape`.
- Open dropdowns and menu popovers must close with `Escape`.
- Focused text-like input elements must clear their value with `Escape` before any parent drawer, modal, dropdown, or selection state handles the key.
- Search inputs must clear with `Escape` and dispatch the same input/update behavior as manual clearing.
- Do not clear multiline textareas with `Escape` unless the textarea is explicitly built as a search field.
- If an input is already empty, `Escape` may continue to the next applicable close/clear behavior.

## History elements

- Query history panels, such as SQL Editor and Charts history, are always placed on the right side.
- Subnavigation panels, such as tables, documents, structure objects, and table-designer tables, are always placed on the left side.
