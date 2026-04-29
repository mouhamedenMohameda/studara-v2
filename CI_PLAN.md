# CI plan (minimal, no-break)

Objectif: détecter tôt les régressions **sans** imposer une infra complexe.

## Stratégie

- Commencer par des checks **rapides**: lint + TypeScript + tests backend.
- Ajouter ensuite des checks plus lourds (build admin, build mobile) si besoin.

## Commandes par projet

### Backend Express (`backend/`)

```bash
cd backend
npm ci || npm install
npm run lint
npm test
npm run build
```

### Mobile Expo (`mobile/`)

```bash
cd mobile
npm ci || npm install
npm run lint
# Optionnel (selon setup): tsc --noEmit si vous avez un script dédié
```

### Admin web (`admin/`)

```bash
cd admin
npm ci || npm install
npm run build
```

### Service Fastify (`services/fastify-api/`)

```bash
cd services/fastify-api
npm ci || npm install
npm run build
npm run lint
```

## Exemple GitHub Actions (optionnel)

> À copier dans `.github/workflows/ci.yml` si/uniquement si vous versionnez le repo dans GitHub.

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [ main ]

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build

  mobile:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: mobile/package-lock.json
      - run: npm ci
      - run: npm run lint

  admin:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: admin
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: admin/package-lock.json
      - run: npm ci
      - run: npm run build

  fastify_service:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/fastify-api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: services/fastify-api/package-lock.json
      - run: npm ci
      - run: npm run build
      - run: npm run lint
```

