#!/usr/bin/env bash
#
# Runs the app's checks, grouped by feature: scripts/checks/<name>.mjs, each
# bundled by vite with its dependencies inlined and run under plain node. No
# test framework; each line is PASS or FAIL, and any FAIL exits 1.
#
#   scripts/check.sh <name>   one feature (npm run check:<name>)
#   scripts/check.sh all      every stubbed feature (npm run check); dex-live,
#                             which needs a running chain, is left out
#
# Stubbed, no chain needed: tx amounts dex handles shielded governance
# personhood staking explorer. Live: dex-live (VITE_EARTH_LCD, default the
# public LCD), and staking's extra live section when VITE_EARTH_LCD is set.
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"
STUBBED=(tx amounts dex handles shielded governance personhood staking explorer)

run() {
  local name="$1" out
  [ -f "scripts/checks/$name.mjs" ] || { echo "no scripts/checks/$name.mjs" >&2; return 2; }
  if ! out="$(CHECK="$name" npx vite build --config scripts/vite.check.config.js 2>&1)"; then
    echo "$out" >&2
    return 1
  fi
  echo '{"type":"module"}' > "build-check/$name/package.json"
  node "build-check/$name/$name.js"
}

trap 'rm -rf "$APP/build-check"' EXIT
case "${1:?usage: check.sh <name>|all}" in
  all)
    failed=()
    for name in "${STUBBED[@]}"; do
      echo "== $name"
      run "$name" || failed+=("$name")
    done
    if [ ${#failed[@]} -gt 0 ]; then echo "failed: ${failed[*]}" >&2; exit 1; fi
    echo "all passed: ${STUBBED[*]}"
    ;;
  *) run "$1" ;;
esac
