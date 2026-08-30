#!/usr/bin/env bash
# Run vitest with postcss.config.mjs temporarily disabled.
# Restores the file even if tests fail (trap).
set -e
cd /opt/wedding-platform
export PATH=$PATH:/home/aenews/.bun/bin

if [ -f postcss.config.mjs ]; then
  mv postcss.config.mjs postcss.config.mjs.v47tmp
  trap 'mv postcss.config.mjs.v47tmp postcss.config.mjs 2>/dev/null || true' EXIT
fi

bunx vitest run "$@" 2>&1
RC=$?
exit $RC
