import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // ─────────────────────────────────────────────────────────────────────
    // CONS-7 task 4 — re-enabled key correctness rules.
    //
    // The audit (§3.8) flagged that 24 rules were disabled, including
    // correctness rules like `no-unreachable` and `no-debugger`. The 6
    // rules below are re-enabled as `warn` (advisory — does NOT block the
    // build) or `error` (genuine bugs that should never ship).
    //
    // Warnings vs errors policy:
    //   - `warn`  : pre-existing debt. Surface in CI output so new code is
    //               reviewed, but the build proceeds (Next.js treats ESLint
    //               warnings as warnings, not failures).
    //   - `error` : correctness rules. These indicate dead code or leftover
    //               debugging statements. Should be fixed immediately, but
    //               we still don't fail the build (CI is `continue-on-error`
    //               per audit H12 — separate concern).
    // ─────────────────────────────────────────────────────────────────────

    // TypeScript rules — re-enabled as warn (debt exists, do not block)
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",

    // React rules — exhaustive-deps re-enabled as warn (real hook bug risk)
    "react-hooks/exhaustive-deps": "warn",
    "react-hooks/purity": "off",
    // P3: React Compiler performance-hint rules — overly strict for pre-existing
    // components (music player autoplay, react-hook-form watch). The code is
    // correct; these are optimization hints, not correctness checks. Disabled
    // for consistency with react-compiler/react-compiler: off above.
    "react-hooks/set-state-in-effect": "off",
    "react-hooks/incompatible-library": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "warn",          // CONS-7 task 4: was off
    "no-console": "warn",              // CONS-7 task 4: was off
    "no-debugger": "error",            // CONS-7 task 4: was off — leftover debug statements
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "error",         // CONS-7 task 4: was off — dead code after return/throw
    "no-useless-escape": "off",
  },
}, {
  // P3: ignore non-app directories. scripts/ (esp. scripts/archive/*.cjs)
  // legitimately uses CommonJS require() for VPS deployment automation —
  // @typescript-eslint/no-require-imports doesn't apply to .cjs files.
  // skills/, mini-services/, backup-frontend/ are independent subprojects.
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "examples/**",
    "skills/**",
    "scripts/**",
    "mini-services/**",
    "backup-frontend/**",
    "tool-results/**",
    "init-db.js",
    "docker-entrypoint.sh",
    "sync-vps-tables-only.js",
  ]
}];

export default eslintConfig;
