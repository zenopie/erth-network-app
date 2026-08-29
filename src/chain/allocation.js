import { getOr, seg } from "./rest";

/**
 * x/allocation — both vote-directed emission streams, over one engine.
 *
 * Every read and message names a stream. The two streams share the option
 * mechanics and share no state: option ids, totals and epochs are per stream, so
 * the human stream's option #1 (registration rewards) and the capital stream's
 * option #1 (LP rewards) are different options.
 *
 *   HUMAN   — the Public Benefit Fund. One human, one vote; requires a live
 *             proof-of-personhood registration (see ./personhood.js).
 *   GROUNDWORKS — the Groundworks Fund. Weighted by bonded stake.
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
 * A stream's allocation options. `kind` is INTEGRATED (resolved every block by a
 * protocol handler, e.g. volume-weighted LP rewards) or ADDRESS (accrues ERTH
 * claimable to a fixed recipient).
 */
export async function allocationOptions(stream) {
  const data = await getOr(
    seg`/earth/allocation/v1/options/${streamPath(stream)}`,
    { options: [] },
  );
  return (data.options ?? []).map(toOption);
}

/**
 * A stream's totals: the reward index, the voting weight currently allocating,
 * and the epoch. A governance reset bumps the epoch of one stream only.
 */
export async function streamTotals(stream) {
  const data = await getOr(
    seg`/earth/allocation/v1/options/${streamPath(stream)}`,
    null,
  );
  return {
    rewardIndex: data?.reward_index ?? "0",
    totalWeight: data?.total_weight ?? "0",
    epoch: Number(data?.epoch ?? 0),
  };
}

/**
 * A voter's split in one stream as [{ optionId, percent }]. The LCD nests this
 * under `voter`, and 404s for an address that has never voted in that stream.
 */
export async function voterAllocations(stream, address) {
  const data = await getOr(
    seg`/earth/allocation/v1/voter/${streamPath(stream)}/${address}`,
    null,
  );
  return (data?.voter?.percentages ?? []).map((w) => ({
    optionId: Number(w.option_id),
    percent: Number(w.percent),
  }));
}

/**
 * The weight backing a voter in one stream. For CAPITAL that is their bonded
 * stake in uerth; for HUMAN it is the flat per-human weight every registration
 * carries.
 */
export async function voterWeight(stream, address) {
  const data = await getOr(
    seg`/earth/allocation/v1/voter/${streamPath(stream)}/${address}`,
    null,
  );
  return data?.voter?.weight ?? "0";
}

// --- messages ---

/**
 * ts-proto emits `number` for uint64, not bigint — passing BigInt breaks
 * encoding. Everything numeric here goes through Number().
 */
export function msgSetAllocations(creator, stream, weights) {
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

export function msgAddAddressOption(submitter, stream, { description, recipient, claimer = "" }) {
  return {
    typeUrl: "/earth.allocation.v1.MsgAddAddressOption",
    value: { submitter, stream: Number(stream), description, recipient, claimer },
  };
}

function toOption(o) {
  return {
    id: Number(o.id),
    stream: o.stream ?? "",
    description: o.description ?? "",
    kind: o.kind ?? "",
    recipient: o.recipient ?? "",
    amountAllocated: o.amount_allocated ?? "0",
    accumulated: o.accumulated ?? "0",
  };
}
