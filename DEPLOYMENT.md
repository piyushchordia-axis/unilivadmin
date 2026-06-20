# Deployment — UNILIV Admin (Docker)

Production stack: a tiny **API** container (Node + a single bundled file, no
`node_modules`) and an **nginx** container that serves the static SPA and
reverse-proxies `/api`. **PostgreSQL stays on the host** and is reached from the
API container over the Docker host gateway.

```
browser ──HTTPS──▶ [edge TLS] ──▶ nginx (web :80) ──/──▶ static SPA
                                          └──/api──▶ api (:8090) ──▶ host Postgres
```

---

## 0. Prerequisites

- A Linux host (x86-64 or arm64) with Docker Engine + Compose v2.
  > Build for the **same CPU architecture as your server**. The build runs on
  > Debian-slim (glibc) and is verified on both linux/amd64 and linux/arm64. To
  > target a specific arch from another builder, prefix:
  > `DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build`.
- PostgreSQL already running on the host.
- DNS: `unilivadmin.enaacreations.com` → this server.

## 1. Prepare host PostgreSQL (installed via apt, NOT in Docker)

The `api` container reaches the host Postgres at `host.docker.internal` (compose
maps it to `host-gateway`). A default apt install only listens on `localhost`
and only trusts loopback, so you must (a) create the DB/user, (b) let it listen
on the Docker bridge, and (c) allow the Docker subnet in `pg_hba.conf`.

**a) Create the database + a password user** (the container can't use `peer`
auth, so set a real password):

```bash
sudo -u postgres psql -c "CREATE USER uniliv WITH PASSWORD 'a-strong-password';"
sudo -u postgres psql -c "CREATE DATABASE uniliv OWNER uniliv;"
```

**b) Listen on all interfaces.** Find your config dir (e.g. `16` = major version):

```bash
PGCONF=$(sudo -u postgres psql -tAc 'SHOW config_file')   # e.g. /etc/postgresql/16/main/postgresql.conf
sudo sed -i "s/^#\?listen_addresses.*/listen_addresses = '*'/" "$PGCONF"
```

**c) Allow the Docker bridge subnets** in `pg_hba.conf` (same dir):

```bash
PGHBA=$(dirname "$PGCONF")/pg_hba.conf
echo "host  all  all  172.16.0.0/12  scram-sha-256" | sudo tee -a "$PGHBA"
sudo systemctl restart postgresql
```

> If you run **ufw**, allow Postgres from the Docker bridge:
> `sudo ufw allow from 172.16.0.0/12 to any port 5432 proto tcp`.

`DATABASE_URL` (step 2) then points at the gateway:
`postgresql://uniliv:a-strong-password@host.docker.internal:5432/uniliv`

> **Prefer not to expose Postgres over TCP?** Alternative: mount the host's
> Unix socket into the container instead. Add to the `api` (and `tools`) service
> `volumes: ["/var/run/postgresql:/var/run/postgresql"]`, keep a `scram-sha-256`
> password user, and set
> `DATABASE_URL=postgresql://uniliv:pw@/uniliv?host=/var/run/postgresql`.
> No `listen_addresses`/`pg_hba` TCP changes needed.

## 2. Configure env

```bash
cp .env.docker.example .env.docker
# edit .env.docker:
#   DATABASE_URL=postgresql://uniliv:a-strong-password@host.docker.internal:5432/uniliv
#   SESSION_SECRET=$(openssl rand -hex 48)
```

## 3. Build

```bash
docker compose build           # on amd64 host
# or on a non-amd64 builder:
# DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build
```

## 4. Create the database schema

```bash
docker compose run --rm tools "pnpm --filter @workspace/db run push-force"
```

This creates all tables on the host Postgres (idempotent on a fresh DB).

### (Optional) seed reference + demo data
Required reference data (OTP limits, meal cut-off windows, kitchens) plus a
demo admin + sample orders:

```bash
docker compose run --rm tools "pnpm --filter @workspace/scripts run seed && \
  pnpm --filter @workspace/scripts run seed:food && \
  pnpm --filter @workspace/scripts run seed:food-extra"
```

> For a clean production DB you may skip the base `seed` and instead create your
> own admin user, but you **should** run `seed:food-extra` (it seeds
> `system_config` for OTP and the meal **cut-off windows** the app relies on).
> Seeded logins use password `Admin@123` — change them immediately.

## 5. Start

```bash
docker compose up -d
docker compose ps
docker compose logs -f api
```

The site is served on port **80**. Verify:

```bash
curl -fsS http://localhost/api/healthz        # {"status":"ok"}
curl -fsSI http://localhost/                   # 200, serves index.html
```

## 6. TLS (important)

The app issues **`Secure` session cookies in production**, so users must reach
the site over **HTTPS** for token refresh to work. Terminate TLS upstream — pick
one:

- **Host reverse proxy** (recommended): run your existing host nginx / Caddy /
  Traefik with a Let's Encrypt cert for `unilivadmin.enaacreations.com` and
  proxy to this container. Map the container to a non-80 port to avoid clashing:
  in `docker-compose.yml` set the `web` port to e.g. `"8080:80"`.
- **Certbot in the container**: mount certs into the `web` container and add a
  `listen 443 ssl;` server block to `docker/nginx.conf`.
- **Cloudflare** (Full/strict) in front.

## Operations

```bash
# Update to a new build
git pull && docker compose build && docker compose up -d

# Apply new schema after a release (additive migrations are safe)
docker compose run --rm tools "pnpm --filter @workspace/db run push-force"

# Logs / restart / stop
docker compose logs -f api web
docker compose restart api
docker compose down
```

## Footprint & internals

- **api** image: `node:22-alpine` + one bundled `dist/index.mjs` (esbuild bundles
  express, pg, drizzle, bcryptjs, jwt, pdf-lib, pino) — **no `node_modules`** at
  runtime. ~60–80 MB.
- **web** image: `nginx:1.27-alpine` + static assets only. ~20–40 MB.
- **tools** image (schema/seed) is built on demand and never runs as a service.
- The API binds `0.0.0.0:8090` inside its container (not published to the host);
  only nginx (`web`) is exposed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| API can't reach DB | Check `DATABASE_URL` uses `host.docker.internal`; verify `listen_addresses` + `pg_hba.conf` allow the docker subnet; `docker compose logs api`. |
| Build fails on a native binary (rollup/oxide/lightningcss) | Build for your server's arch, e.g. `DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build`. |
| Login works but session drops after 15 min | Serve over **HTTPS** (Secure cookies); see §6. |
| 502 from nginx | API unhealthy — `docker compose logs api`, check DB connectivity. |
