# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (backend venv + frontend npm)
make install

# Initialize database + seed 3000 notes + compute baseline stats
make data

# Start both services (backend + frontend)
./start.sh

# Manual start
cd backend && source venv/bin/activate && uvicorn app.main:app --port 8001 --reload
cd frontend && npm run dev

# Production: build frontend then serve everything from backend on one port
cd frontend && npm run build
cd backend && source venv/bin/activate && uvicorn app.main:app --port 8001

# Run backend tests
make test
# or: cd backend && source venv/bin/activate && python -m pytest tests/ -v

# Frontend type check + build
cd frontend && npx tsc --noEmit && npx vite build

# Full CI
make ci
```

## Architecture

NoteRx is a Xiaohongshu note diagnosis platform. Users submit a note (text/screenshot/link), and 5 AI agents analyze it through a multi-round debate.

### Multi-Agent Flow (backend/app/agents/orchestrator.py)

```
Input → TextAnalyzer + ImageAnalyzer
     → BaselineComparator (SQLite)
     → Round 1: 4 agents diagnose in parallel (asyncio.gather)
        ContentAgent | VisualAgent | GrowthAgent | UserSimAgent
     → Round 2: Each agent debates others' opinions
     → Round 3: JudgeAgent synthesizes final report
     → Response assembly
```

### Model Tiers (configured in backend/.env)

Three models via Xiaomi MiMo API (OpenAI-compatible):
- `MODEL_PRO` (mimo-v2-pro) — 1M context, used for all agent diagnosis + debate + judging
- `MODEL_OMNI` (mimo-v2-omni) — multimodal, used for OCR/image analysis
- `MODEL_FAST` (mimo-v2-flash) — used for quick tasks like generating comments

`base_agent.py` handles MiMo gateway quirks: `max_completion_tokens` instead of `max_tokens`, fallback when `response_format=json_object` is unsupported, proxy bypass via `trust_env=False`.

### Frontend-Backend Connection

- **Dev mode**: Vite proxy forwards `/api/*` to backend (configured in `frontend/vite.config.ts`)
- **Production**: FastAPI serves the built SPA via `SPAMiddleware` — all non-`/api` routes fall through to `index.html`
- Both modes use the same `/api` prefix

### Database

SQLite at `backend/data/baseline.db`. Two main concerns:
- **Baseline data**: 3000 seeded notes across 6 categories, pre-computed stats (avg title length, tag distribution, viral rates). Used by `BaselineComparator`.
- **Diagnosis history**: `diagnosis_history` table, auto-created on startup via `lifespan` hook in `main.py`.

### Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/diagnose` | Main diagnosis (multipart form) |
| POST | `/api/generate-comments` | Generate more simulated comments (flash model) |
| GET | `/api/baseline/{category}` | Category baseline stats |
| POST | `/api/parse-link` | Parse Xiaohongshu share links |
| CRUD | `/api/history` | Diagnosis history |

### Frontend Stack

React 19 + TypeScript + MUI v9 + Vite. Framer Motion for page transitions and tab animations. ECharts for radar chart. html2canvas for export.

Pages: Home (input) → Diagnosing (progress) → Report (results with score, radar, dimension bars, baseline comparison, agent debate, simulated comments, export card).

## Configuration

Copy `.env.example` to `backend/.env`. Key vars:
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` — API credentials
- `LLM_MODEL_FAST` / `LLM_MODEL_PRO` / `LLM_MODEL_OMNI` — model names per tier
- `LLM_PROVIDER` — `openai` (default) or `anthropic`

The `_is_mimo_openai_compat()` function in `base_agent.py` auto-detects MiMo gateway from URL or model name.
