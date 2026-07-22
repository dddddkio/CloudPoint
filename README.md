# CloudPoint — 简易点云上传平台

Upload LAS point clouds through the browser, validate & store them, record
metadata in PostgreSQL, and view them online in a Three.js WebGL viewer
(RGB + rotate / zoom / pan).

Full flow: **上传点云 → 校验 → 存文件(MinIO) → 记录元数据(PostgreSQL) → 前端列表 → 浏览器在线查看**.

---

## 1. Tech stack & why

| Layer     | Choice                     | Why |
|-----------|----------------------------|-----|
| Frontend  | React + Vite + TailwindCSS | Fast dev server, utility-first styling |
| Viewer    | Three.js                   | Renders the raw `.las` directly in-browser — RGB + OrbitControls (rotate/zoom/pan), no server-side preprocessing |
| Backend   | FastAPI                    | Typed, async, auto OpenAPI docs; concise validation & tests |
| Database  | PostgreSQL (SQLAlchemy 2)  | Robust relational store for metadata |
| Storage   | MinIO (S3-compatible)      | Keeps large binaries **out of the DB** (brief requirement) |
| LAS parse | Custom header parser + laspy | Cheap, testable header-level validation |

**Monorepo** (`backend/` + `frontend/`): one clone, one README, one API
contract. Small project → no benefit to splitting repos.

**Why Three.js over Potree?** Potree gives streaming LOD but requires
`PotreeConverter` (a C++ binary, Windows-only prebuilds) to pre-process each
LAS into octree tiles — heavy to run and verify on macOS/ARM. For the scale in
this brief, parsing the raw `.las` in the browser and rendering with Three.js
delivers the required RGB + orbit controls with no preprocessing step. The
tradeoff: very large clouds are subsampled client-side (see §7).

## 2. Project structure

```
CloudPoint/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app + CORS + table bootstrap
│   │   ├── config.py         # env-driven settings (no hard-coded secrets)
│   │   ├── database.py       # SQLAlchemy engine/session
│   │   ├── models.py         # PointCloud metadata table
│   │   ├── schemas.py        # API contract
│   │   ├── las.py            # ★ LAS validation & metadata (core logic)
│   │   ├── storage.py        # MinIO wrapper (put / presigned GET)
│   │   ├── db_migrate.py     # runs Alembic upgrade on startup
│   │   └── routers/point_clouds.py  # upload / list / detail / download-url
│   ├── alembic.ini           # migration config (no secrets — URL from .env)
│   ├── migrations/           # ★ every schema change recorded here
│   │   ├── env.py
│   │   └── versions/         # one file per migration, chronological
│   └── tests/test_las.py     # ★ automated tests for the core logic
└── frontend/
    └── src/
        ├── App.jsx, api.js
        ├── lib/lasLoader.js   # ★ browser LAS parser (positions + RGB)
        └── components/{UploadForm,PointCloudList,PointCloudViewer}.jsx
```

## 3. Install, configure & run

### Prerequisites
Python 3.11–3.13 (3.14 lacks binary wheels for some deps at time of writing),
Node 18+, and a reachable PostgreSQL + MinIO (S3-compatible) instance.
Connection strings are supplied via `backend/.env`.

PostgreSQL and MinIO are provided externally; point `backend/.env` at them.

### a) Backend
```bash
cd backend
cp .env.example .env          # point DATABASE_URL / MINIO_* at your infra
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload # http://localhost:8000  (docs at /docs)
```

### b) Frontend
```bash
cd frontend
cp .env.example .env          # VITE_API_BASE=http://localhost:8000
npm install
npm run dev                   # http://localhost:5173
```

## 4. Data flow & API

Upload: browser `POST /api/point-clouds` (multipart) → backend reads bytes →
`parse_las_header` validates → raw LAS stored in MinIO under `<id>/raw/<name>`
→ metadata row inserted → JSON returned. **The binary is never written to the
DB** — only object keys.

View: browser `GET /{id}/download-url` → backend returns a short-lived
presigned MinIO URL → browser fetches the raw `.las`, parses it
(`lib/lasLoader.js`) and renders it with Three.js. The backend never streams
the binary itself — the browser pulls it straight from object storage.

| Method | Path                              | Purpose |
|--------|-----------------------------------|---------|
| POST   | `/api/point-clouds`               | Upload & validate a LAS file |
| GET    | `/api/point-clouds`               | List all records |
| GET    | `/api/point-clouds/{id}`          | Single record + bbox |
| GET    | `/api/point-clouds/{id}/download-url` | Presigned MinIO URL |
| GET    | `/health`                         | Liveness |

## 5. Database & file storage design

`point_clouds` table (metadata only): `id`, `original_filename`, `size_bytes`,
`raw_object_key`, `las_version`, `point_count`, `point_format`, `has_rgb`,
`min/max_x/y/z`, `created_at`.

MinIO bucket (configurable, e.g. `cloudpoint`), layout `<id>/raw/<filename>`
for the original binary. DB ↔ storage linked by `raw_object_key`.

### Migrations (Alembic)

All schema changes are versioned under `backend/migrations/versions/` — one
file per change, each with `upgrade()` / `downgrade()`. On startup the app
calls `alembic upgrade head` (`app/db_migrate.py`), so a fresh database is
provisioned automatically and existing ones are brought up to date; no manual
step to boot. The applied revision is tracked in the `alembic_version` table.

Common commands (run from `backend/`, venv active):
```bash
alembic revision --autogenerate -m "describe change"   # after editing models
alembic upgrade head        # apply (also runs automatically on app startup)
alembic downgrade -1        # roll back one revision
alembic history / current   # inspect
```
`alembic.ini` holds no credentials — `migrations/env.py` reads `DATABASE_URL`
from `backend/.env` and diffs against the ORM models in `app/models.py`.

## 6. Validation & tests

`app/las.py` parses the LAS **public header** per the ASPRS spec and rejects:
wrong signature (`LASF`), unsupported version, zero points, inverted bbox,
truncated files. This proves a file is genuinely LAS rather than trusting its
extension.

```bash
cd backend && source .venv/bin/activate && pytest -q   # 7 passing
```

## 7. Known issues, tradeoffs & next steps

- **Client-side rendering scales to ~a few million points.** The browser
  downloads and parses the whole `.las`; `lib/lasLoader.js` uniformly
  subsamples above `maxPoints` (default 2M) to stay responsive, and the viewer
  labels when a cloud was subsampled. For truly large clouds the right answer
  is server-side tiling (Potree/3D Tiles) with streaming LOD.
- **Object-storage egress is the practical bottleneck for viewing.** Since the
  browser pulls the raw binary from MinIO, viewer latency tracks storage
  bandwidth. On the Zeabur MinIO instance used in dev, download throughput was
  ~13 KB/s, so a 2.3 MB cloud took ~3 min while a 166 KB cloud loaded in ~11 s.
  This is infra-dependent, not a code limit; a colocated/faster bucket removes
  it. Server-side tiling would also help by shipping only visible tiles.
- **`.laz` (compressed) not supported** — uncompressed `.las` only. Adding
  `laz-perf` (WASM) to the loader would cover it.
- **Auto-migrate on startup** is convenient for this project but means a slow
  boot if a migration is heavy, and concurrent instances could race; a
  dedicated migration step in the deploy pipeline is safer at scale.
- **Whole-file read into memory** on upload — fine for the brief's scale;
  streaming/multipart-to-MinIO would scale better.
- No auth/multi-tenancy — out of scope.

## Assumptions
- Single-user, trusted environment (no auth).
- LAS 1.0–1.4; LAZ (compressed) not handled.
- Infra credentials supplied via environment; nothing sensitive is committed.
