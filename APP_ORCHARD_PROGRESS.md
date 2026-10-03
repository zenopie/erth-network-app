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

## Final chain formats (chain-orch fced976, 2026-10-02)
- Protos regenerated @ fced976 (dex bundle msgs: fee fields gone, new
  denom_in/amount_in, erth_amount; allocation Voter.option_weights;
  Position.split_epoch; max_positions gone, min_delegation added).
  MsgShield/MsgBuyAnml/MsgRemoveLiquidity unchanged on the wire.
- MsgShield now carries the 177-byte v2 blind ciphertext (was v1 217);
  msgShield/msgBuyAnml/ANML-pool msgRemoveLiquidity refuse any other length.
- chain/address.js canonicalAddress: explorer search, account page and
  referrer lookup use the canonical lowercase bech32.
- Groundworks: allocation.validatorVoter(s) (key "gwpos/"||val bytes as
  earth bech32); GroundworksFund "By validator" table + "From positions"
  from voters; position weight = query's live derth x epoch rate, lapsed
  flag via split_epoch; StakeErth Groundworks column.
- No /gas/transparent (or other gas endpoint) references in the app.

## Checks
- check:explorer, check:staking, check:privacy pass; npm run build passes.
- check:dex: 4 live-LCD checks fail (lcd.erth.network Cloudflare 530; same
  on the base commit), not code.
