#!/usr/bin/env bash
#
# Runs src/chain/explorer.js against stubbed LCD responses and asserts the
# validator-view logic. No chain and no test runner required.
#
#   npm run check:explorer
#
# The app has no unit-test framework yet; this is a stopgap covering the logic
# where reading the chain correctly is subtle — notably that a jailed validator
# does NOT report 100% uptime just because x/slashing zeroed its missed-block
# counter.
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"
trap 'rm -rf "$APP/build-check"' EXIT

npx vite build --config scripts/vite.check.config.js >/dev/null
echo '{"type":"module"}' > build-check/package.json
node build-check/check-explorer.js
