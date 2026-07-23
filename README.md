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
│   │   ├── security.py       # Cloudflare Access JWT validation
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
        └── components/{UploadDialog,UploadForm,PointCloudList,PointCloudViewer}.jsx
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

The UI follows a resource-oriented flow: `Workspace` provides status and
recent activity, `Point clouds` is the single file library, and selecting a
file opens its `3D workspace`. Upload is a contextual library dialog rather
than a top-level page. Download is a contextual action on the selected file
and requests an attachment-disposition presigned URL.

| Method | Path                              | Purpose |
|--------|-----------------------------------|---------|
| POST   | `/api/point-clouds`               | Upload & validate a LAS file |
| GET    | `/api/point-clouds`               | List all records |
| GET    | `/api/point-clouds/{id}`          | Single record + bbox |
| GET    | `/api/point-clouds/{id}/download-url` | Presigned MinIO URL |
| GET    | `/api/session`                    | Current Cloudflare Access identity |
| GET    | `/`                               | Service metadata + useful links |
| GET    | `/health` / `/health/live`        | Process liveness |
| GET    | `/health/ready`                   | PostgreSQL + MinIO readiness |

### Service logging & request tracing

The backend writes one structured JSON object per line by default. Every HTTP
request produces an access log with `request_id`, method, path, status code,
duration and client IP. Clients may supply `X-Request-ID`; otherwise the server
generates one. The same ID is returned in the response header and in safe 500
responses, so an error reported by a user can be matched to its server log.

Operational response headers include `X-Request-ID`, `X-Process-Time-Ms` and
basic browser hardening headers. Unhandled exceptions are logged with a stack
trace while the API response omits internal details.

Logging is environment-driven:

```dotenv
APP_NAME=CloudPoint API
APP_VERSION=0.1.0
ENVIRONMENT=development
LOG_LEVEL=INFO
LOG_FORMAT=json  # use text for human-friendly local output
```

`/health/live` only checks the API process. `/health/ready` returns HTTP 200
when both PostgreSQL and the configured MinIO bucket are reachable, otherwise
HTTP 503 with a per-dependency status. This split is suitable for container
liveness and readiness probes.

### Cloudflare Access authentication

Production uses Cloudflare Access as the identity-aware proxy. The reviewer
opens the normal application URL, completes the email policy configured in
Cloudflare Zero Trust, and receives Cloudflare's `HttpOnly`
`CF_Authorization` application cookie. The frontend does not read this cookie
and does not contain an invitation token or API secret.

Cloudflare adds `Cf-Access-Jwt-Assertion` when forwarding authenticated
requests to the origin. Every `/api/point-clouds` route and `/api/session`
validates that JWT again at the FastAPI layer:

- RS256 signature against the team's rotating JWKS;
- exact Cloudflare team issuer;
- exact Access application Audience (`AUD`);
- token lifetime and required subject/email claims.

Production configuration:

```dotenv
ENVIRONMENT=production
AUTH_MODE=cloudflare_access
CF_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
CF_ACCESS_AUDIENCE=your-application-aud-tag
```

The recommended deployment exposes both the SPA and `/api/*` on one protected
hostname. `VITE_API_BASE` is empty in that setup, so browser requests are
same-origin and automatically include the Access cookie. Publish the origin
through Cloudflare Tunnel (or otherwise restrict the origin) so its public IP
cannot bypass Access.

For local development only, set `ENVIRONMENT=development` and
`AUTH_MODE=development`. This creates a clearly labelled local reviewer
identity without requiring Cloudflare. The backend refuses this mode when
`ENVIRONMENT` is not `development`.

Note that CORS does not authenticate a frontend. A user who has legitimately
passed the Access email policy can call the API with their own valid session;
the security guarantee is authenticated reviewer identity and an unreachable
origin, not that requests were produced by a particular JavaScript bundle.

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
cd backend && source .venv/bin/activate && pytest -q   # 20 passing
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
- **Cloudflare Access owns login and session policy.** The application does
  not maintain passwords or a persistent session table; authorization beyond
  the current reviewer role would need application-level roles or groups.

## Assumptions
- Reviewer email allow-list and session policy are configured in Cloudflare
  Access; the API independently validates the resulting application JWT.
- LAS 1.0–1.4; LAZ (compressed) not handled.
- Infra credentials supplied via environment; nothing sensitive is committed.
