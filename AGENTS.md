# Repository Guidelines

## Project Structure & Module Organization
- `frontend/` contains the React + TypeScript app. Main UI code lives in `frontend/src/`, with reusable UI in `components/`, route pages in `pages/`, shared helpers in `utils/`, and static assets in `assets/` and `public/`.
- `backend/` contains the FastAPI service. API endpoints are in `backend/app/api/`, agent orchestration in `backend/app/agents/`, analyzers in `backend/app/analysis/`, baseline logic in `backend/app/baseline/`, and Pydantic schemas in `backend/app/models/`.
- `backend/tests/` holds backend pytest suites. Database bootstrap scripts live in `scripts/`. Project docs and research pages live in `docs/`.

## Build, Test, and Development Commands
- `./start.ps1` ！ starts backend (`:8000`) and frontend (`:5173`) together on Windows.
- `make install` ！ creates the backend virtualenv and installs backend/frontend dependencies.
- `make data` ！ initializes SQLite data and baseline statistics.
- `make test` ！ runs backend tests with pytest.
- `make ci` ！ runs backend tests, then frontend type-check and production build.
- `cd frontend && npm run dev` ！ starts Vite for frontend-only work.
- `cd frontend && npm run lint` ！ runs ESLint for TypeScript/React files.

## Coding Style & Naming Conventions
- TypeScript/TSX: use 2-space indentation, semicolons, and double quotes to match the existing codebase.
- React components and page files use `PascalCase` (`ScoreCard.tsx`, `ScreenshotAnalysis.tsx`); utility modules use `camelCase` (`localMemory.ts`).
- Python: follow PEP 8 with 4-space indentation, `snake_case` module/function names, and concise docstrings for non-trivial functions.
- Use the existing ESLint config in `frontend/eslint.config.js`; do not introduce a second formatter without team agreement.

## Testing Guidelines
- Backend tests use `pytest`; place new tests under `backend/tests/` and name them `test_*.py`.
- No frontend test runner is configured yet. For frontend changes, at minimum run `npm run lint` and `make ci` before opening a PR.
- No formal coverage threshold is enforced; contributors should add or update tests for every backend behavior change.

## Commit & Pull Request Guidelines
- Follow the repository¨s current commit style: conventional prefixes such as `feat:`, `fix:`, and `refactor:` with short imperative summaries.
- Keep PRs focused. Include: a clear summary, linked issue/task if applicable, test evidence (`make test`, `make ci`, lint output), and screenshots or screen recordings for UI changes.

## Security & Configuration Tips
- Copy `.env.example` before local setup; never commit real secrets, generated databases, `frontend/dist/`, or virtualenv contents.
- Treat `backend/data/` as local runtime state unless a change explicitly updates seed or baseline logic.
