# SQLite Hub UI Rules for Codex

Follow these rules exactly when creating or modifying UI controls.

1. Reuse existing shared components before creating anything new.
2. Use exactly one semantic main class per control.
3. Never combine multiple button-style classes on the same element.
4. View-specific classes may change layout, width, spacing, or position only.
5. View-specific classes must not redefine the base style of shared components.
6. The standard height for interactive controls is `36px`.
7. The source of truth for control height is `--control-height` in `frontend/styles/tokens.css`.
8. Controls in the same row must have the same height.
9. All regular buttons must use one of these classes only: `standard-button`, `signature-button`, `delete-button`.
10. Use `standard-button` for normal actions.
11. Use `signature-button` only for the primary yellow CTA in a context.
12. Use `delete-button` only for destructive actions.
13. `signature-button` must keep its hover state and chamfered corner.
14. All visible clickable buttons must have a hover state.
15. Disabled states must come from the shared component, not from local view CSS.
16. All reusable checkboxes must use `standard-checkbox`.
17. Do not build feature-specific checkbox shells or checkbox base styles.
18. Inputs and selects must follow the shared base rules in `frontend/styles/base.css`.
19. Ghost or transparent inputs must not use a white background, including unfocused state.
20. When a new control pattern appears in multiple places, promote it to a shared component first, then migrate existing usages.

## Source of Truth

- `frontend/styles/tokens.css`
- `frontend/styles/base.css`
- `frontend/index.html`

## Default Decision Rules

- Prefer reuse over invention.
- Prefer migration over local override.
- Prefer shared component updates over per-view fixes.
