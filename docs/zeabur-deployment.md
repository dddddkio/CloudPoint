# Zeabur deployment

CloudPoint uses one public, Access-protected application hostname. The current
production entry point is:

```text
https://cloudpoint-access-gateway.linxin5661.workers.dev
```

```text
Reviewer
  -> Cloudflare Access
  -> Cloudflare Worker (cloudpoint-access-gateway)
  -> Zeabur generated web domain
  -> frontend (Caddy :8080)
       /api/*, /health/* -> backend.zeabur.internal:8080
       everything else  -> Vite SPA
  -> PostgreSQL and MinIO over private networking
```

The Worker is the only reviewer-facing entry point and proxies to the generated
Zeabur web URL. The frontend Caddy service performs the path split. This avoids
requiring a purchased custom domain while preserving one origin for the SPA
and API.

## Services

Create all services in one Zeabur project:

1. `cloudpoint-web`: Git service, repository root `frontend`.
2. `cloudpoint-api`: Git service, repository root `backend`.
3. PostgreSQL: database service.
4. MinIO: template service with persistent storage.
Both Git services use the Dockerfiles in their root directories.

## Backend variables

```dotenv
ENVIRONMENT=production
AUTH_MODE=cloudflare_access
CF_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
CF_ACCESS_AUDIENCE=your-application-aud-tag

DATABASE_URL=postgresql+psycopg://user:password@postgresql.zeabur.internal:5432/database

MINIO_ENDPOINT=storage.example.com
MINIO_ACCESS_KEY=replace-me
MINIO_SECRET_KEY=replace-me
MINIO_SECURE=true
MINIO_BUCKET=cloudpoint

APP_NAME=CloudPoint API
APP_VERSION=0.1.0
LOG_LEVEL=INFO
LOG_FORMAT=json
CORS_ORIGINS=https://cloudpoint-access-gateway.linxin5661.workers.dev
MAX_UPLOAD_MB=95
```

Use the PostgreSQL variables and private hostname displayed by Zeabur rather
than copying the example credentials above.

The MinIO endpoint used to create presigned URLs must be reachable by the
reviewer's browser. Bind only the S3 API port to `storage.example.com`, keep
the bucket private, and do not expose the MinIO console. `MINIO_BUCKET` must
match the bucket that already contains the uploaded object keys; changing it
creates a valid but empty storage namespace and makes existing downloads
return 404. Configure its API CORS allow-origin value to the CloudPoint
application hostname.

## Frontend variables

```dotenv
BACKEND_UPSTREAM=http://cloudpoint-api.zeabur.internal:8080
VITE_API_BASE=
```

Replace the upstream hostname with the backend's fixed private hostname from
its Zeabur **Networking > Private** section. Keep `VITE_API_BASE` empty so all
business requests stay on the application origin.

## Cloudflare Worker and Access

1. Deploy `cloudflare/worker.js` as `cloudpoint-access-gateway`.
2. Set its `ORIGIN_URL` variable to the generated Zeabur web URL.
3. Create a Cloudflare Access self-hosted application for the Worker hostname.
4. Add an exact reviewer-email Allow policy.
5. Copy the application's AUD tag into the backend
   `CF_ACCESS_AUDIENCE` variable.
6. Set `CF_ACCESS_TEAM_DOMAIN` to the account's Access team domain.

No public domain is required for the backend. A request that somehow reaches
the backend without Cloudflare's signed `Cf-Access-Jwt-Assertion` is rejected
by FastAPI.

## Verification

After both Git services are healthy and the Access-protected Worker route is
active:

```text
GET https://cloudpoint-access-gateway.linxin5661.workers.dev/health/live
GET https://cloudpoint-access-gateway.linxin5661.workers.dev/health/ready
GET https://cloudpoint-access-gateway.linxin5661.workers.dev/api/session
```

Then verify upload, rendering, and download through the protected application
hostname. If an upload returns HTTP 413, check the Cloudflare plan request-body
limit; Free and Pro plans currently accept up to 100 MB per proxied request.
