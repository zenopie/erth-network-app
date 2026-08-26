#!/usr/bin/env bash
#
# Update the web app's Akash lease in place, from the SDL in this directory.
#
#   deploy/akash/deploy.sh           deploy the committed digest
#   deploy/akash/deploy.sh --print   build the SDL and show it, submit nothing
#
# The image is whatever deploy.yaml is pinned to, which CI rewrites on every
# release tag — so the sequence is: tag, let CI build and pin, `git pull`, then
# run this. Tagging alone publishes an image and changes nothing that is served.
#
# In place, so the lease and its tunnel survive. Only image and env changes can
# go this way: endpoint kinds and resources are part of what the provider bid
# on, and changing those needs a close-and-recreate — which means a new lease,
# and a new lease means reattaching the tunnel. See README.md.
#
# --print writes the real token to stdout for a human to read. Never redirect it
# to a file in the repo.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MODE="${1:-}"

[ -f "$ROOT/.env" ] || { echo "no .env — it holds the secrets injected into the submitted SDL" >&2; exit 1; }
set -a; . "$ROOT/.env"; set +a
: "${AKASH_API_KEY:?set AKASH_API_KEY in .env}"
: "${TUNNEL_TOKEN:?set TUNNEL_TOKEN in .env}"

# The web app's deployment. The same API key reaches the chain's and the
# backend's, and they are told apart only by their service names — so this is
# hardcoded rather than discovered, and the check below refuses to submit if the
# SDL in hand is not the one this dseq is running.
DSEQ="${DSEQ:-1787052820013}"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# TUNNEL_TOKEN is not in the committed SDL, so it is spliced into the submitted
# copy. Exactly one `env: []` is expected, under cloudflared; anything else means
# the file moved on and a blind substitution would put the token somewhere it
# does not belong, or nowhere at all.
python3 - "$HERE/deploy.yaml" "$WORK/sdl.yaml" "$TUNNEL_TOKEN" <<'PY'
import sys
src, dst, token = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src).read()

if "web:" not in text or "cloudflared:" not in text:
    sys.exit("refusing: this SDL is not the web app's (no web/cloudflared services)")

marker = "    env: []"
if text.count(marker) != 1:
    sys.exit(f"refusing: expected exactly one '{marker}', found {text.count(marker)}")

text = text.replace(marker, "    env:\n      - TUNNEL_TOKEN=" + token)
open(dst, "w").write(text)
PY

if [ "$MODE" = "--print" ]; then
  cat "$WORK/sdl.yaml"; exit 0
fi

python3 -c "
import json,sys
json.dump({'data':{'sdl':open(sys.argv[1]).read()}}, open(sys.argv[2],'w'))
" "$WORK/sdl.yaml" "$WORK/body.json"

CODE=$(curl -sS -m 180 -X PUT \
  -H "x-api-key: ${AKASH_API_KEY}" -H 'content-type: application/json' \
  --data-binary @"$WORK/body.json" \
  "https://console-api.akash.network/v1/deployments/${DSEQ}" \
  -o "$WORK/resp.json" -w '%{http_code}')

if [ "$CODE" != "200" ]; then
  echo "deploy failed (http $CODE)" >&2; head -c 600 "$WORK/resp.json" >&2; echo >&2; exit 1
fi

IMAGE=$(grep -o 'ghcr.io/zenopie/erth-network-app@sha256:[a-f0-9]*' "$HERE/deploy.yaml")
echo "deployed to $DSEQ"
echo "  $IMAGE"
