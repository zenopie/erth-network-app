#!/usr/bin/env bash
#
# Runs the quote-driven forms' floors (Buy ANML's amount-bound quote, add
# liquidity's min_shares from fresh reserves) against a stubbed LCD. No chain
# required.
#
#   npm run check:forms
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"
trap 'rm -rf "$APP/build-check"' EXIT
npx vite build --config scripts/vite.forms.config.js >/dev/null 2>&1
echo '{"type":"module"}' > build-check/package.json
node build-check/check-forms.js
