# Repository Guidelines

## Project Structure & Module Organization

SQLite Hub is a local-first Node/Express app with a browser SPA. Backend code lives in `server/`: routes in `server/routes`, domain services in `server/services`, SQLite helpers in `server/services/sqlite`, and shared utilities in `server/utils`. Frontend code lives in `frontend/`: views in `frontend/js/views`, reusable UI in `frontend/js/components`, state/router logic in `frontend/js/store.js` and `frontend/js/router.js`, and styles in `frontend/styles`. CLI entrypoint code is in `bin/sqlite-hub.js`. Tests are in `tests/*.test.js`. Documentation is in `docs/`, with user-facing overview content in `README.md`.

## Build, Test, and Development Commands

- `npm run dev` starts the local server with Node watch mode on port `4180`.
- `npm start` runs the packaged CLI entrypoint.
- `npm test` runs all Node test files under `tests/`.
- `npm run build` or `npm run build:css` regenerates `frontend/styles/tailwind.generated.css`.
- `npm run screenshots` refreshes the standard screenshot set; use `npm run screenshots:backup-drawer` for the backup drawer capture.
- `npm run audit` checks production dependencies for high-severity issues.

## Coding Style & Naming Conventions

Use plain JavaScript and existing local patterns. Frontend modules use ES modules; backend modules mostly use CommonJS. Prefer small, focused functions and reuse existing components before adding new UI primitives. Keep UI work aligned with `/docs/guidelines/DESIGN.md`; shared button, input, drawer, modal, and Escape-key behavior should stay consistent. Use descriptive camelCase for functions and variables, PascalCase only for classes/services, and route/view files named by feature, for example `tableAdvisor.js`.

## Testing Guidelines

Tests use the built-in Node test runner (`node:test`) with `node:assert/strict`. Name files `feature-name.test.js` and keep fixtures local to each test unless reuse is clearly helpful. Add focused tests for backend services, routes, state changes, and rendered view markup when behavior changes. Run the relevant focused test first, then `npm test` before handing off.

## Commit & Pull Request Guidelines

Recent history uses short, informal messages, but contributors should keep commits clear and scoped, for example `add table advisor view` or `fix backup usage summary`. Pull requests should include a concise summary, test commands run, linked issue or context when available, and screenshots for visible UI changes. Note any generated files, especially `frontend/styles/tailwind.generated.css`, when CSS utilities change.

## Security & Configuration Tips

Do not commit local databases, tokens, or `.env` files. Use `.env.example` for documented configuration. Local API changes must preserve loopback-only and API-token protections in `server/middleware`.
