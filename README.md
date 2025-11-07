# Care Coordinator – Fullstack (Flask + React/Vite)

This is a ready-to-run fullstack package that pairs a **Flask backend** with a **React/Vite** frontend.
It also includes your **patient context API** (copied from your `flask-app.py`) and the hospital **data_sheet.txt**.

## Ports
- Patient context API: **http://localhost:5002** (backend calls this)
- Assistant backend (Flask): **http://localhost:5050**
- Frontend (Vite dev): **http://localhost:5173** (proxies `/assist` → backend)

## Quick start (Dev)

Open three terminals:

### 1) Patient Context API
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# run the provided patient API on port 5002
python patient_api.py  # ensure it starts at http://localhost:5002
```

If your patient API binds to 5000 by default, change it to 5002 (or set `CONTEXT_API_BASE` env var for the backend).

### 2) Assistant Backend
```bash
cd backend
source .venv/bin/activate
export FLASK_PORT=5050
export CONTEXT_API_BASE=http://localhost:5002
export PATIENT_ID=1
# (optional) export OPENAI_API_KEY=sk-...
python app.py
```

### 3) Frontend (React/Vite)
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**. The dev server proxies `/assist` to **http://localhost:5050**.

## Production build (single process)

1) Build the frontend:
```bash
cd frontend
npm install
npm run build
```

2) Serve the built frontend via Flask (same backend process):
```bash
cd backend
source .venv/bin/activate
export FLASK_PORT=5050
export CONTEXT_API_BASE=http://localhost:5002
python app.py
```
Now open **http://localhost:5050** — Flask serves the compiled frontend from `../frontend/dist/` and the API from `/assist`.

## Notes
- The assistant follows rules: office hours only; NEW=30m, ESTABLISHED=15m; established if completed visit within 5 years; arrival guidance (30m new / 10m established); insurance acceptance or self‑pay quotes.
- LLM is used only for **wording** — all logic is deterministic and audit‑friendly. Without an API key, responses fall back to an offline template.
- You can tune ports and base URLs via env vars in `backend/.env.example`.
