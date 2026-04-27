# GHCR Compose Image Deploy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build production Docker images on push, publish them to GHCR, and provide a server-ready Compose deployment path.

**Architecture:** Keep local development Compose unchanged and add a separate production Compose file that pulls immutable images from GHCR. Build API, worker, public web, and admin web images from repository Dockerfiles through one GitHub Actions matrix.

**Tech Stack:** Docker, Docker Compose, GitHub Actions, GHCR, FastAPI, Next.js, pnpm.

---

### Task 1: Production Image Files

**Files:**
- Create: `.dockerignore`
- Create: `docker/api.Dockerfile`
- Create: `docker/worker.Dockerfile`
- Create: `docker/web.Dockerfile`

**Steps:**
1. Exclude local secrets, dependency folders, generated assets, caches, and local databases from Docker contexts.
2. Add Python runtime images for API and worker.
3. Add a parameterized Next.js image for `public-web` and `admin-web`.
4. Verify Dockerfile syntax through local image builds where possible.

### Task 2: Production Compose and Env Template

**Files:**
- Create: `docker-compose.prod.yml`
- Create: `.env.production.example`
- Create: `infra/nginx/nginx.prod.conf`
- Create: `scripts/deploy-prod.sh`
- Modify: `.env.example`

**Steps:**
1. Add image-based Compose services for postgres, api, worker, public-web, admin-web, and nginx.
2. Keep fixed service ports explicit.
3. Mount a shared generated assets volume into API and worker.
4. Provide production-safe placeholder environment variables.
5. Add a small server-side pull-and-up deployment script.

### Task 3: GHCR Workflow

**Files:**
- Create: `.github/workflows/build-ghcr-images.yml`

**Steps:**
1. Trigger on pushes to `main`, version tags, and manual dispatch.
2. Log in to GHCR with `GITHUB_TOKEN`.
3. Build and push all four service images through a matrix.
4. Publish `latest` for `main`, branch/tag refs, and sha tags.

### Task 4: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `infra/docker/README.md`
- Modify: `infra/nginx/README.md`

**Steps:**
1. Replace the production deployment caveat with the new GHCR workflow.
2. Document first server setup and deploy commands.
3. Run Compose config validation, YAML parse checks, relevant builds/tests, and git diff checks.
4. Commit and push the result to `origin/main`.
