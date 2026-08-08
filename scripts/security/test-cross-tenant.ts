/**
 * P0-12 — CROSS-TENANT ISOLATION TEST SUITE (restored)
 *
 * Wrapper that runs all 3 isolation tests in sequence:
 *   1. scripts/test-tenant-extension.ts      — Prisma tenant-scoped extension unit tests
 *   2. scripts/test-isolation.ts             — End-to-end tenant isolation (7 cases)
 *   3. scripts/security/repro-p0-cross-tenant.ts — P0 cross-tenant guest lookup reproducible proof (4 cases)
 *
 * Exit codes:
 *   0 = ALL tests passed (P0 isolation confirmed)
 *   1 = AT LEAST ONE test failed (P0 regression — investigate immediately)
 *   2 = setup error (DB not reachable, dev server down, etc.)
 *
 * Usage:
 *   bun run scripts/security/test-cross-tenant.ts
 *   BASE_URL=http://localhost:3000 bun run scripts/security/test-cross-tenant.ts
 */

import { execSync } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'

const ROOT = path.resolve(import.meta.dirname, '..', '..')

const TESTS = [
  { name: 'tenant-extension', file: 'scripts/test-tenant-extension.ts' },
  { name: 'isolation',        file: 'scripts/test-isolation.ts' },
  { name: 'repro-p0',         file: 'scripts/security/repro-p0-cross-tenant.ts' },
] as const

function exists(p: string): boolean {
  try { return fs.statSync(p).isFile() } catch { return false }
}

async function main() {
  console.log('═'.repeat(72))
  console.log('P0-12 — CROSS-TENANT ISOLATION TEST SUITE')
  console.log('═'.repeat(72))

  let anyFailed = false

  for (const t of TESTS) {
    const full = path.join(ROOT, t.file)
    console.log()
    console.log(`── ${t.name}  (${t.file}) ──`)
    if (!exists(full)) {
      console.error(`  MISSING: ${full}`)
      anyFailed = true
      continue
    }
    try {
      execSync(`bun run ${t.file}`, {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, BASE_URL: process.env.BASE_URL || 'http://localhost:3000' },
        timeout: 60_000,
      })
      console.log(`  ✓ ${t.name} PASSED`)
    } catch (err: any) {
      console.error(`  ✗ ${t.name} FAILED`)
      anyFailed = true
    }
  }

  console.log()
  console.log('═'.repeat(72))
  if (anyFailed) {
    console.error('RESULT: AT LEAST ONE TEST FAILED — P0 ISOLATION NOT CONFIRMED')
    process.exit(1)
  }
  console.log('RESULT: ALL ISOLATION TESTS PASSED — P0 CONFIRMED')
  process.exit(0)
}

main().catch((err) => {
  console.error('Setup error:', err)
  process.exit(2)
})
