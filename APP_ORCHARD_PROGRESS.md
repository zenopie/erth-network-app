# App: Orchard protocol port (branch privacy/orchard)

Source of truth: chain-orch privacy/orchard (ORCHARD_DESIGN.md §12-13).

## Done
- Protos regenerated from chain-orch (scripts/gen-proto.sh).

## Todo
- Fix reads (derth supply, LP shares private, position owner_tag).
- Check MsgShield / MsgBuyAnml / Keplr encoders; disable unsupported shielded flows.
- Checks + build.
