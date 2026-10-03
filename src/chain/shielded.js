import { getOr } from "./rest";
import { b64ToHex } from "./bytes";
import { UERTH } from "./config";
import { blindNotePayment, checkBlindCiphertext, memoBytes } from "./noteCipher";
import { assetId, cm as noteCm, fieldFromBytes, fieldToBytes } from "./privacy";
import { decodeShieldedAddress } from "./shieldedAddress";

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
 * pc = H(TAG_PC, owner_pk, rho, rcm) hides the recipient's owner key behind
 * fresh randomness, and `ciphertext` is the note's amount-blind v2
 * ciphertext to the recipient's X25519 key (exactly 177 bytes, required by
 * the chain) so their wallet can find it (chain/noteCipher.js). Use shieldTo
 * to build both from a shielded address.
 */
export function msgShield(sender, denom, amount, pc, ciphertext) {
  checkBlindCiphertext(ciphertext);
  return {
    typeUrl: "/earth.shielded.v1.MsgShield",
    value: { sender, amount: { denom, amount: String(amount) }, pc, ciphertext },
  };
}

const U64_MAX = (1n << 64n) - 1n;

/**
 * What shieldTo checks before it draws any randomness: the address decodes,
 * the amount is a positive u64 integer string, the memo fits. Cheap enough to
 * run on every keystroke; throws a message fit to show.
 */
export function checkShield(address, amount, memo = "") {
  decodeShieldedAddress(address);
  const s = String(amount ?? "");
  if (!/^\d+$/.test(s) || BigInt(s) <= 0n) throw new Error("Enter a positive amount.");
  if (BigInt(s) > U64_MAX) throw new Error("Amount is too large for one note.");
  memoBytes(memo);
}

/**
 * Shields `amount` uerth (a base-unit integer string) from `sender` to the
 * shielded `address` (erthz1…). Like every note the chain mints, it carries
 * the amount-blind v2 ciphertext; the recipient's wallet opens it on its next
 * sync and completes cm from the shield's public amount. Returns { msg, cm }
 * (cm hex, the note's public commitment). Throws on a bad address or amount
 * with a message fit to show.
 */
export function shieldTo(sender, address, amount, { memo = "", denom = UERTH } = {}) {
  checkShield(address, amount, memo);
  const s = String(amount);
  const { pc, ciphertext } = blindNotePayment(address, { memo });
  const cmBytes = fieldToBytes(noteCm(assetId(denom), BigInt(s), fieldFromBytes(pc)));
  const cm = Array.from(cmBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return { msg: msgShield(sender, denom, s, pc, ciphertext), cm };
}
