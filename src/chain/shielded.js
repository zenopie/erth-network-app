import { getOr } from "./rest";
import { b64ToHex } from "./bytes";

/**
 * x/shielded — the note pool.
 *
 * Nothing here takes an owner: the chain deliberately has no "my notes" query,
 * since asking for them would tell the LCD operator which ones they are.
 * Wallets sync the whole tree on the phone. The web app reads only aggregates:
 * the tree, the admitted assets, and each asset's turnstile (what has entered
 * and left the pool), whose difference is exactly the module's balance.
 */

/** Note tree: notes ever appended, current root, and the newest usable anchor. */
export async function tree() {
  const data = await getOr("/earth/shielded/v1/tree", null);
  if (!data) return null;
  return {
    size: Number(data.tree_size ?? 0),
    root: data.root ?? "",
    anchor: data.anchor
      ? {
          root: b64ToHex(data.anchor.root),
          height: Number(data.anchor.height ?? 0),
          time: Number(data.anchor.time ?? 0),
          treeSize: Number(data.anchor.tree_size ?? 0),
        }
      : null,
  };
}

/** Denoms admitted to the pool, with their in-circuit asset ids (hex). */
export async function assets() {
  const data = await getOr("/earth/shielded/v1/assets?pagination.limit=200", null);
  if (!data) return null;
  return (data.assets ?? []).map((a) => ({ denom: a.denom ?? "", assetId: b64ToHex(a.asset_id) }));
}

/**
 * Per-denom turnstiles: { denom, in, out, held } in base units as strings,
 * `held = in - out` being what the pool holds of it right now.
 */
export async function turnstiles() {
  const data = await getOr("/earth/shielded/v1/turnstiles?pagination.limit=200", null);
  if (!data) return null;
  return (data.turnstiles ?? []).map((t) => {
    let held = "0";
    try {
      held = (BigInt(t.in ?? "0") - BigInt(t.out ?? "0")).toString();
    } catch {
      /* leave 0 */
    }
    return { denom: t.denom ?? "", in: t.in ?? "0", out: t.out ?? "0", held };
  });
}

/** Pool params: minimum private-tx fee (uerth) and the note root window. */
export async function params() {
  const data = await getOr("/earth/shielded/v1/params", null);
  const p = data?.params;
  if (!p) return null;
  return {
    minFee: p.min_fee ?? "0",
    rootWindowSeconds: Number(p.root_window_seconds ?? 0),
  };
}

// --- messages ---

/**
 * MsgShield: transparent coins from `sender` into a new note.
 *
 * The note commitment is H(TAG_CM, asset, value, pc) with
 * pc = H(TAG_PC, owner_pk, rho, rcm) — the recipient's owner key blinded by
 * fresh randomness — and `ciphertext` is the note encrypted to the
 * recipient's x25519 key so their wallet can find it.
 *
 * TODO(shielded-address): there is no UI for this yet because the chain does
 * not define the erth1z… shielded-address encoding (owner_pk, ek_pub) — the
 * plan names it but neither chain-privacy nor zk/privacy implements it. Once
 * it is specified, shielding to a pasted address needs: decode the address;
 * Poseidon2 (BN254, zk/poseidon2 parameters) for pc; x25519 + the note
 * encryption scheme for the ciphertext. Both must match the mobile wallet
 * byte for byte, so port them from there rather than reinventing them.
 */
export function msgShield(sender, denom, amount, pc, ciphertext = new Uint8Array(0)) {
  return {
    typeUrl: "/earth.shielded.v1.MsgShield",
    value: { sender, amount: { denom, amount: String(amount) }, pc, ciphertext },
  };
}
