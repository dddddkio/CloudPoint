# Zeabur deployment

CloudPoint uses one public application hostname:

```text
Reviewer
  -> Cloudflare Access
  -> Zeabur Gateway
  -> frontend (Caddy :8080)
       /api/*, /health/* -> backend.zeabur.internal:8080
       everything else  -> Vite SPA
  -> PostgreSQL and MinIO over private networking
```

The Zeabur Gateway owns the public domain route. The frontend Caddy service
does the path split because Gateway routes bind a domain to one upstream
service and port.

## Services

Create all services in one Zeabur project:

1. `cloudpoint-web`: Git service, repository root `frontend`.
2. `cloudpoint-api`: Git service, repository root `backend`.
3. PostgreSQL: database service.
4. MinIO: template service with persistent storage.
5. Gateway: enable from **Add-ons > Gateway**.

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
CORS_ORIGINS=https://cloudpoint.example.com
MAX_UPLOAD_MB=100
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

## Gateway and domain

1. Enable **Add-ons > Gateway**.
2. Add one custom-domain route for `cloudpoint.example.com`.
3. Set its upstream to `cloudpoint-web`, port `8080`.
4. Add the CNAME target shown by Zeabur to Cloudflare DNS and enable proxying.
5. Protect `cloudpoint.example.com` with one Cloudflare Access self-hosted
   application and an exact reviewer-email Allow policy.
6. Copy that application's AUD tag into `CF_ACCESS_AUDIENCE`.

No public domain is required for the backend. A request that somehow reaches
the backend without Cloudflare's signed `Cf-Access-Jwt-Assertion` is rejected
by FastAPI.

## Verification

After both Git services are healthy and the Gateway route is active:

```text
GET https://cloudpoint.example.com/health/live
GET https://cloudpoint.example.com/health/ready
GET https://cloudpoint.example.com/api/session
```

Then verify upload, rendering, and download through the protected application
hostname. If an upload returns HTTP 413, check the Cloudflare plan request-body
limit; Free and Pro plans currently accept up to 100 MB per proxied request.
