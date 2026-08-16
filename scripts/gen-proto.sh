#!/usr/bin/env bash
#
# Regenerates src/proto/** from the earth chain's .proto files.
#
# The app signs native earth transactions, so it needs JS encoders for the
# chain's Msg types. These are generated with ts-proto (via buf) and registered
# with cosmjs in src/chain/tx.js.
#
# Run this whenever the chain's proto/earth/** changes:
#   ./scripts/gen-proto.sh [path-to-earth-network-chain]
#
# Requires: buf (brew install bufbuild/buf/buf). No protoc needed — the ts-proto
# plugin is pulled from the buf remote registry.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAIN_DIR="${1:-$APP_DIR/../earth-network-chain}"

if [ ! -d "$CHAIN_DIR/proto/earth" ]; then
  echo "error: no proto/earth in '$CHAIN_DIR'" >&2
  echo "usage: $0 [path-to-earth-network-chain]" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cp -r "$CHAIN_DIR/proto/earth" "$WORK/"
cp "$CHAIN_DIR/proto/buf.gen.ts.yaml" "$WORK/"

# The chain's proto dir has no buf.yaml (ignite supplies deps itself), so
# declare the well-known cosmos/gogo/googleapis modules here.
cat > "$WORK/buf.yaml" <<'EOF'
version: v2
modules:
  - path: .
deps:
  - buf.build/cosmos/cosmos-sdk
  - buf.build/cosmos/gogo-proto
  - buf.build/cosmos/cosmos-proto
  - buf.build/googleapis/googleapis
EOF

( cd "$WORK" && buf dep update >/dev/null && buf generate --template buf.gen.ts.yaml -o out )

rm -rf "$APP_DIR/src/proto"
mkdir -p "$APP_DIR/src/proto"
cp -r "$WORK"/out/earth "$WORK"/out/cosmos "$WORK"/out/cosmos_proto \
      "$WORK"/out/gogoproto "$WORK"/out/amino "$WORK"/out/google \
      "$APP_DIR/src/proto/"

# The app only signs Msgs and reads chain state over the LCD's JSON REST API, so
# the generated gRPC query services and module descriptors are dead weight.
find "$APP_DIR/src/proto/earth" -name "query.ts" -delete
find "$APP_DIR/src/proto/earth" -name "genesis.ts" -delete
find "$APP_DIR/src/proto/earth" -path "*/module/*" -delete
rm -rf "$APP_DIR/src/proto/earth/pki" "$APP_DIR/src/proto/earth/earth"
find "$APP_DIR/src/proto/earth" -type d -empty -delete

echo "regenerated $APP_DIR/src/proto from $CHAIN_DIR"
