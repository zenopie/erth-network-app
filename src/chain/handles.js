import { EARTH_API_URL, EARTH_CHAIN_ID, EARTH_LCD_URL } from "./config";
import { decodeShieldedAddress } from "./shieldedAddress";

/**
 * Handles (x/personhood): a registered human's name in the chain's public
 * directory for a shielded (erthz1…) address. Lowercase a-z, 0-9 and -, 3 to
 * 32 characters, no dash at either end; the chain does no case folding.
 *
 * Lifecycle: live until expires_at (it resolves: pay it); then, until
 * renewal_until, reserved to its owner and not resolving; then free. Nothing
 * renews on its own.
 *
 * Every lookup reads the WHOLE directory and filters it here: there is no
 * per-handle query anywhere in this app, since asking for the one handle about
 * to be paid would tell the server who pays whom. The privacy backend's
 * /handles stream (a snapshot at one height, paged by place) is read first;
 * the chain's own Query/Handles pages are the fallback, and are read (whole)
 * again before money moves, so neither the backend nor a stale cache can
 * redirect a payment.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 32;
export const LIVE = "live";
export const RENEWAL = "renewal";
export const FREE = "free";
const STATUSES = new Set([LIVE, RENEWAL, FREE]);

/** Query/Handles' largest page; the backend's page. */
export const PAGE = 1000;
/**
 * The most rows a directory may have (the backend's cap, spec §4g): more, or
 * a stream whose page 0 claims more, is refused whole rather than downloaded
 * and held.
 */
export const MAX_ROWS = 1_000_000;
const MAX_PAGES = MAX_ROWS / PAGE;
/** How far ahead of now a lease time may be: 10 years (spec §4g). */
export const MAX_AHEAD_SECONDS = 10 * 365 * 86400;
const STREAM_RESTARTS = 3;
/** How old a copy a payment may use, in seconds. */
export const FRESH_SECONDS = 60;

/** Whether `h` is a handle as the chain spells one. */
export function validHandle(h) {
  if (typeof h !== "string" || h.length < HANDLE_MIN || h.length > HANDLE_MAX) return false;
  if (!/^[a-z0-9-]+$/.test(h)) return false;
  return h[0] !== "-" && h[h.length - 1] !== "-";
}

/** What someone typed ("@Alice", " alice ") as a handle, or null. */
export function parseHandle(input) {
  const h = String(input ?? "").trim().replace(/^@/, "").trim().toLowerCase();
  return validHandle(h) ? h : null;
}

/** Whether `input` reads as a handle rather than an address. */
export function looksLikeHandle(input) {
  const t = String(input ?? "").trim();
  if (t.startsWith("@")) return true;
  if (/^(earth1|erthz1)/i.test(t)) return false;
  return parseHandle(t) !== null;
}

/** "erthz1abcdefgh…wxyzwxyz": a shielded address shown for confirmation. */
export function truncateAddress(a, head = 14, tail = 8) {
  const s = String(a ?? "");
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** An entry's status as of `now` (unix seconds): the served one, demoted when its times have passed. */
export function statusAt(e, now) {
  if (e.status === FREE) return FREE;
  if (now < e.expiresAt) return e.status;
  if (now < e.renewalUntil) return RENEWAL;
  return FREE;
}

const num = (v) => {
  const n = Number(v ?? 0);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("the handle directory holds a time that is not one");
  return n;
};

const entry = (handle, address, status, expiresAt, renewalUntil) => ({
  handle: String(handle ?? ""),
  address: String(address ?? ""),
  status: String(status ?? ""),
  expiresAt: num(expiresAt),
  renewalUntil: num(renewalUntil),
});

/** 0 < expires_at <= renewal_until <= now + 10 years: times a lease can have (spec §4g). */
export const timesOk = (e, now) =>
  e.expiresAt > 0 && e.expiresAt <= e.renewalUntil && e.renewalUntil <= now + MAX_AHEAD_SECONDS;

function check(e, after, out, now) {
  if (!validHandle(e.handle)) throw new Error(`the directory holds ${JSON.stringify(e.handle.slice(0, 40))}, not a handle`);
  if (e.handle <= after || out.has(e.handle)) throw new Error(`the directory is out of order at ${e.handle}`);
  if (!STATUSES.has(e.status)) throw new Error(`handle ${e.handle}: status ${e.status.slice(0, 20)}`);
  // Spec §4g: an entry whose times no lease has refuses the
  // whole directory, as does a row past MAX_ROWS.
  if (!timesOk(e, now)) throw new Error(`handle ${e.handle}: times out of range`);
  if (out.size >= MAX_ROWS) throw new Error(`the directory has more than ${MAX_ROWS} handles`);
}

const unixNow = () => Math.floor(Date.now() / 1000);

/**
 * The chain's directory, every page from the first: `fetchChainPage(start,
 * limit)` resolves to { handles: [entry], next } (next "" when exhausted).
 */
export async function readChainDirectory(fetchChainPage, now = unixNow()) {
  const out = new Map();
  let start = "";
  for (let pages = 0; ; pages++) {
    if (pages > MAX_PAGES) throw new Error("the directory has too many pages");
    const page = await fetchChainPage(start, PAGE);
    if (page.handles.length > PAGE) throw new Error("the node sent more handles than a page holds");
    for (const e of page.handles) {
      check(e, start, out, now);
      out.set(e.handle, e);
      start = e.handle;
    }
    if (!page.next || page.handles.length === 0) return out;
    if (page.next !== start) throw new Error("the directory's next is not its last handle");
  }
}

/**
 * The backend's snapshot: pages 0, PAGE, 2·PAGE … (its paging rule: fixed,
 * aligned pages) to its last; started over when the snapshot's height changes
 * between pages (at most STREAM_RESTARTS times). `fetchStreamPage(fromIndex,
 * limit)` resolves to { handles, height, size, fromIndex, lastPage }.
 */
export async function readStreamDirectory(fetchStreamPage, now = unixNow()) {
  for (let attempt = 0; attempt < STREAM_RESTARTS; attempt++) {
    const out = new Map();
    let from = 0;
    let height = null;
    let last = "";
    let moved = false;
    for (;;) {
      const page = await fetchStreamPage(from, PAGE);
      if (page.fromIndex !== from || page.handles.length > PAGE) throw new Error("the indexer's handle page is not the one asked for");
      if (from === 0) {
        height = page.height;
        if (!Number.isSafeInteger(page.size) || page.size < 0 || page.size > MAX_ROWS) {
          throw new Error(`the indexer's directory claims ${String(page.size).slice(0, 20)} handles`);
        }
      } else if (page.height !== height) {
        moved = true;
        break;
      }
      for (const e of page.handles) {
        check(e, last, out, now);
        out.set(e.handle, e);
        last = e.handle;
      }
      if (page.lastPage || page.handles.length < PAGE) {
        if (out.size !== page.size) throw new Error(`the indexer's directory holds ${out.size} of its ${page.size} handles`);
        return out;
      }
      from += PAGE;
      if (from / PAGE > MAX_PAGES) throw new Error("the directory has too many pages");
    }
    if (!moved) throw new Error("the indexer's handle stream ended early");
  }
  throw new Error("the indexer's handle directory kept changing while it was read");
}

/** Whether `a` decodes as a shielded address; the reason when not. */
export function addressProblem(a) {
  try {
    decodeShieldedAddress(a);
    return "";
  } catch (err) {
    return `not a payable shielded address (${err.message})`;
  }
}

const same = (a, b) =>
  a.handle === b.handle && a.address === b.address && a.status === b.status && a.expiresAt === b.expiresAt && a.renewalUntil === b.renewalUntil;

/**
 * `served` (the backend's copy, or the chain's) checked entry by entry
 * against `chain` (the chain's own whole directory): a Map in handle order of
 * { ...entry, verified, problem }. An entry the chain does not hold the same
 * way is unverified; a handle the chain holds and the copy omits is added
 * from the chain. An address that does not decode is never verified.
 */
export function verifyAgainst(served, chain) {
  const out = new Map();
  for (const e of served.values()) {
    const c = chain.get(e.handle);
    let problem = !c ? "the chain has no such handle" : !same(e, c) ? "the chain names something else" : addressProblem(e.address);
    out.set(e.handle, { ...e, verified: !problem, problem });
  }
  for (const c of chain.values()) {
    if (out.has(c.handle)) continue;
    const problem = addressProblem(c.address);
    out.set(c.handle, { ...c, verified: !problem, problem });
  }
  return new Map([...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
}

/**
 * A cached directory over two fetchers (either may be omitted: no backend
 * means the chain's pages alone). `now` is unix seconds.
 */
export function createHandleDirectory({ fetchChainPage, fetchStreamPage = null, now = () => Math.floor(Date.now() / 1000), maxAgeSeconds = 600 }) {
  let entries = null;
  let fetchedAt = 0;
  let chainEntries = null;
  let chainFetchedAt = 0;

  async function chainDirectory(maxAge = maxAgeSeconds) {
    const t = now();
    if (chainEntries && t - chainFetchedAt >= 0 && t - chainFetchedAt <= maxAge) return chainEntries;
    chainEntries = await readChainDirectory(fetchChainPage, now());
    chainFetchedAt = now();
    return chainEntries;
  }

  async function all(maxAge = maxAgeSeconds) {
    const t = now();
    if (entries && t - fetchedAt >= 0 && t - fetchedAt <= maxAge) return entries;
    let out = null;
    if (fetchStreamPage) {
      try {
        out = await readStreamDirectory(fetchStreamPage, now());
      } catch {
        out = null; // the chain's own pages instead
      }
    }
    entries = out ?? (await chainDirectory(maxAge));
    fetchedAt = now();
    return entries;
  }

  function invalidate() {
    entries = null;
    chainEntries = null;
  }

  /**
   * `input` resolved for a payment: { ok: true, entry, address (decoded) } or
   * { ok: false, reason }. Live in a fresh copy (at most FRESH_SECONDS old)
   * and live with the same address in the chain's own directory (also whole,
   * also fresh).
   */
  async function resolveForPayment(input) {
    const h = parseHandle(input);
    if (!h) return { ok: false, reason: `"${String(input ?? "").trim().slice(0, 40)}" is not a handle.` };
    const e = (await all(FRESH_SECONDS)).get(h);
    if (!e) return { ok: false, reason: `@${h} is not claimed by anyone.` };
    if (statusAt(e, now()) !== LIVE) return { ok: false, reason: `@${h} has lapsed and names no address now.` };
    const c = (await chainDirectory(FRESH_SECONDS)).get(h);
    if (!c || c.address !== e.address || statusAt(c, now()) !== LIVE) {
      invalidate();
      return { ok: false, reason: `@${h} changed on chain since the directory was read. Try again.` };
    }
    let address;
    try {
      address = decodeShieldedAddress(e.address);
    } catch (err) {
      return { ok: false, reason: `@${h} names an address that cannot be paid: ${err.message}` };
    }
    return { ok: true, entry: e, address };
  }

  /**
   * The directory for display: every entry of all() checked against the
   * chain's own whole directory, plus any handle the chain has and the copy
   * left out. Each entry carries `verified` (the chain holds the same
   * address, status and times, and the address decodes as a shielded address)
   * and, when not, `problem`. Only a verified entry's address may be shown as
   * the handle's, copied or paid: the backend alone can name anything.
   */
  async function verifiedAll(maxAge = maxAgeSeconds) {
    const served = await all(maxAge);
    const chain = await chainDirectory(maxAge);
    return verifyAgainst(served, chain);
  }

  /** One handle from verifiedAll(), or null. */
  async function verifiedLookup(h, maxAge) {
    return (await verifiedAll(maxAge)).get(h) ?? null;
  }

  return {
    all,
    chainDirectory,
    invalidate,
    resolveForPayment,
    verifiedAll,
    verifiedLookup,
    lookup: async (h, maxAge) => (await all(maxAge)).get(h) ?? null,
  };
}

// --- the app's fetchers ----------------------------------------------------

async function json(url) {
  const res = await fetch(url, { redirect: "error" });
  if (!res.ok) throw new Error(`${res.status} on ${url.replace(/\?.*$/, "")}`);
  return res.json();
}

/** Query/Handles: handles after `start`, at most `limit`. */
export async function chainHandlesPage(start, limit) {
  const q = `start=${encodeURIComponent(start)}&limit=${limit}`;
  const d = await json(`${EARTH_LCD_URL}/earth/personhood/v1/handles?${q}`);
  return {
    handles: (d.handles ?? []).map((h) => entry(h.handle, h.address, h.status, h.expires_at, h.renewal_until)),
    next: String(d.next ?? ""),
  };
}

/**
 * The backend's base for this chain, exactly /privacy/<chain_id>/<genesis>
 * as its status names it (chain id ours, genesis 16 lowercase hex digits);
 * anything else is refused, so a hostile status cannot point the reads
 * anywhere else.
 */
export function validBase(base, chainId, genesis, expected = EARTH_CHAIN_ID) {
  if (!chainId || !genesis || chainId !== expected) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(chainId) || !/^[0-9a-f]{16}$/.test(genesis)) return false;
  return base === `/privacy/${chainId}/${genesis}`;
}

let streamBase = null;

/** One page of the backend's /handles stream. */
export async function streamHandlesPage(fromIndex, limit) {
  if (!streamBase) {
    const st = await json(`${EARTH_API_URL}/privacy/status`);
    if (!validBase(st.base, st.chain_id, st.genesis)) throw new Error("the privacy backend names no valid base");
    streamBase = st.base;
  }
  let d;
  try {
    d = await json(`${EARTH_API_URL}${streamBase}/handles?from_index=${fromIndex}&limit=${limit}`);
  } catch (e) {
    streamBase = null; // a relaunch moves the base: read status again next time
    throw e;
  }
  return {
    handles: (d.handles ?? []).map((r) => entry(r[0], r[1], r[2], r[3], r[4])),
    height: d.height ?? null,
    size: Number(d.size ?? 0),
    fromIndex: Number(d.from_index ?? -1),
    lastPage: Boolean(d.last_page),
  };
}

/** The app's one directory. */
export const handleDirectory = createHandleDirectory({
  fetchChainPage: chainHandlesPage,
  fetchStreamPage: EARTH_API_URL ? streamHandlesPage : null,
});
