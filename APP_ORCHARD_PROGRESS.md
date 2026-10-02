# App: Orchard protocol port (branch privacy/orchard)

Source of truth: chain-orch privacy/orchard (ORCHARD_DESIGN.md §12-13).

## Done
- Protos regenerated from chain-orch (scripts/gen-proto.sh).
- shieldedStaking.js: derth supply from the Validator query (supply, fallback
  state.derth_supply; never bank); positions carry ownerTag (one-time key
  retired); stakeTree() read (/earth/shieldedstaking/v1/stake_tree).
- UI/text: stake notes owner-locked + non-transferable (StakeErth, gov,
  Governance, GroundworksFund); ExplorerShielded: derth/unbond not pool
  assets, stake-tree size row, dexlp supply shown; Markets/dex: shielded LP
  shares are private notes (only transparent balance/unbondings shown;
  pool reserves + total shares stay public).
- Encoders: MsgShield, MsgBuyAnml, MsgRemoveLiquidity unchanged on the wire;
  check-notes asserts field numbers + that no bundle msg is registered.
  The web app never built bundle msgs (MsgSend/NoteSwap/AddLiquidityShielded/
  RemoveLiquidityShielded/staking): nothing to disable.

## Checks
- check:explorer, check:staking, check:privacy pass; npm run build passes.
- check:dex: 4 live-LCD checks fail (lcd.erth.network Cloudflare 530; same
  on the base commit), not code.
