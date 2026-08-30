# Wedding OS — CI/CD GitHub Actions (LEVEL 1 scaffolding)

> Pipeline CI complet : typecheck + lint + unit/integration/security tests
> + Playwright Golden Path + build + security gates.
> Référence : Mission V4, sections 50/63/65.

## Fichier : `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    name: Typecheck + Lint + Unit tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit
      - run: bunx eslint src --max-warnings 0
      - run: bunx vitest run --coverage
        env:
          DATABASE_URL: file:./test-ci.db
          JWT_SECRET: ${{ secrets.CI_JWT_SECRET }}
          ENCRYPTION_KEY: ${{ secrets.CI_ENCRYPTION_KEY }}
          NODE_ENV: test

  security:
    name: Security gates
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      # 1. Pas de secret en clair dans src/
      - run: |
          if rg -n "(sk_live_|sk_test_|ghp_|AKIA)[A-Za-z0-9]{20,}" src/ ; then
            echo "FAIL: secret détecté en clair" ; exit 1
          fi
      # 2. Pas de db. brut en dehors de platform/
      - run: |
          if rg -n "from '@/lib/db'" src/app/w src/app/api/guest src/app/api/guests \
              | grep -v "unsafePlatformDb" ; then
            echo "WARN: usage de db brut en zone tenant-scopée" ; exit 1
          fi
      # 3. Pas de JWT_SECRET inféré en dur
      - run: |
          if rg -n "JWT_SECRET\s*=\s*['\"][^'\"]{3,}['\"]" src/ ; then
            echo "FAIL: JWT_SECRET hardcoded" ; exit 1
          fi
      # 4. Pas de .bak commité
      - run: |
          if find src public -name '*.bak*' | grep -q . ; then
            echo "FAIL: fichiers .bak dans le repo" ; exit 1
          fi

  e2e:
    name: Golden Path E2E (Playwright)
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - run: |
          bun run build
          PORT=3099 bun run start &
          sleep 5
          bunx playwright test tests/e2e/golden-path.spec.ts
        env:
          DATABASE_URL: file:./test-e2e.db
          JWT_SECRET: ${{ secrets.CI_JWT_SECRET }}
          ENCRYPTION_KEY: ${{ secrets.CI_ENCRYPTION_KEY }}
          E2E_BASE_URL: http://127.0.0.1:3099
          NODE_ENV: test
```

## Dépendances à ajouter à `package.json`

```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@playwright/test": "^1.45.0",
    "jsdom": "^25.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "lint:strict": "eslint src --max-warnings 0"
  }
}
```

## Couverture cible (P0 puis P1)

| Zone | Tests | Cible |
|---|---|---|
| `src/lib/auth.ts` | 6 | 100 % des branches fail-fast |
| `src/lib/guest-auth.ts` | 5 | signature + token + ban |
| `src/lib/prisma-extensions/tenant-scoped.ts` | 7 | injection + IDOR |
| `src/lib/commercial/pricing-engine.ts` | 3 | prix serveur + anti-spoof |
| `src/lib/rate-limit.ts` | 2 | synchrone + Redis fallback |
| `/api/guest/rsvp` | 4 | validation + idempotence |
| `/api/check-in` | 3 | cross-tenant + re-scan WARN |
| `/api/webhooks/charow` | 3 | signature + idempotence |
| `/api/guests/[id]` | 3 | IDOR 403 + guest self |
| Total P0 | 40-60 | cible mission V4 section 15 |

Total visé après P1 : 120-150 tests, couverture 70 %+ sur `src/lib/`.
