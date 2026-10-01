import { getOr, seg } from "./rest";

/**
 * x/allocation — both vote-directed emission streams, over one engine.
 *
 * Every read and message names a stream. The two streams share the option
 * mechanics and share no state: option ids, totals and epochs are per stream.
 *
 *   CARETAKER   — one human, one vote. Splits are cast anonymously from the
 *                 mobile app (x/personhood MsgSetCaretaker, a membership
 *                 proof) and filed under a nullifier, not an address, so
 *                 there is no per-voter read here; each split lapses after
 *                 R days unless the app refreshes it.
 *   GROUNDWORKS — weighted by stake. Most of that weight is Groundworks
 *                 positions (locked private derth, see ./shieldedStaking.js);
 *                 the rest is validators' own self-bond, which an operator can
 *                 still direct transparently with MsgSetAllocations.
 */

/**
 * Stream ids as the chain's protobuf enum numbers them. Messages carry these
 * values; the LCD wants the *name* in the URL path (see streamPath).
 */
export const STREAM_CARETAKER = 1;
export const STREAM_GROUNDWORKS = 2;

/**
 * The LCD spells the stream out in full — grpc-gateway parses the enum by name
 * and rejects the short form the CLI accepts. `/options/human` returns
 * "type mismatch, parameter: stream".
 */
function streamPath(stream) {
  switch (stream) {
    case STREAM_CARETAKER:
      return "STREAM_ID_CARETAKER";
    case STREAM_GROUNDWORKS:
      return "STREAM_ID_GROUNDWORKS";
    default:
      throw new Error(`unknown allocation stream: ${stream}`);
  }
}

/**
 * A stream's options plus its aggregates: { options, totalWeight, epoch }, or
 * null when the read fails. `kind` is INTEGRATED (resolved every block by a
 * protocol handler, e.g. LP rewards) or ADDRESS (accrues ERTH claimable to a
 * fixed recipient). Options are paged on chain (adding an ADDRESS option is
 * permissionless), so every page is walked.
 */
export async function streamView(stream) {
  const options = [];
  let totalWeight = "0";
  let epoch = 0;
  let key = "";
  for (let page = 0; page < 20; page++) {
    const q = `?pagination.limit=100${key ? `&pagination.key=${encodeURIComponent(key)}` : ""}`;
    const data = await getOr(seg`/earth/allocation/v1/options/${streamPath(stream)}` + q, null);
    if (!data) return page === 0 ? null : { options, totalWeight, epoch };
    options.push(...(data.options ?? []).map(toOption));
    totalWeight = data.total_weight ?? totalWeight;
    epoch = Number(data.epoch ?? epoch);
    key = data.pagination?.next_key ?? "";
    if (!key) break;
  }
  return { options, totalWeight, epoch };
}

/** Just the options of a stream ([] when unreadable). */
export async function allocationOptions(stream) {
  return (await streamView(stream))?.options ?? [];
}

/**
 * An address's Groundworks split as [{ optionId, percent }] and the weight it
 * carries (its bonded stake — on this chain, a validator's self-bond). The
 * LCD 404s for an address that has never voted. Caretaker splits are keyed by
 * nullifier and cannot be read this way.
 */
export async function groundworksVoter(address) {
  const data = await getOr(
    seg`/earth/allocation/v1/voter/${streamPath(STREAM_GROUNDWORKS)}/${address}`,
    null,
  );
  return {
    splits: (data?.voter?.percentages ?? []).map((w) => ({
      optionId: Number(w.option_id),
      percent: Number(w.percent),
    })),
    weight: data?.voter?.weight ?? "0",
  };
}

// --- messages ---

/**
 * ts-proto emits `number` for uint64, not bigint — passing BigInt breaks
 * encoding. Everything numeric here goes through Number().
 */
// Groundworks only: the chain refuses a caretaker split from an address.
export function msgSetAllocations(creator, stream, weights) {
  if (Number(stream) !== STREAM_GROUNDWORKS) {
    throw new Error("Caretaker splits are cast privately from the mobile app.");
  }
  return {
    typeUrl: "/earth.allocation.v1.MsgSetAllocations",
    value: {
      creator,
      stream: Number(stream),
      percentages: weights.map((w) => ({
        optionId: Number(w.optionId),
        percent: Number(w.percent),
      })),
    },
  };
}

export function msgClaimAllocation(creator, stream, optionId) {
  return {
    typeUrl: "/earth.allocation.v1.MsgClaimAllocation",
    value: { creator, stream: Number(stream), optionId: Number(optionId) },
  };
}

function toOption(o) {
  return {
    id: Number(o.id),
    stream: o.stream ?? "",
    description: o.description ?? "",
    kind: o.kind ?? "",
    recipient: o.recipient ?? "",
    handler: o.handler ?? "",
    claimer: o.claimer ?? "",
    removed: Boolean(o.removed),
    amountAllocated: o.amount_allocated ?? "0",
    accumulated: o.accumulated ?? "0",
  };
}
