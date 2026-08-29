import { EARTH_LCD_URL, EARTH_RPC_URL } from "./config";

/**
 * Tagged template for an LCD path, encoding every interpolated value.
 *
 *   get(seg`/cosmos/bank/v1beta1/balances/${address}`)
 *
 * Values reaching these paths are route parameters — an address, a tx hash, a
 * pool id — and most of them come from the URL bar, where anyone can put
 * anything. Interpolated raw, a `../` walks the request to a different endpoint
 * and the page renders whatever came back.
 *
 * A tag rather than a rule about remembering encodeURIComponent at each call
 * site: there are twenty of them, they all looked fine, and the next one added
 * would have looked fine too.
 *
 * For paths carrying a query string, encode the values individually instead —
 * this would escape the `?`, `=` and `&` that separate them.
 */
export function seg(strings, ...values) {
  return strings.reduce(
    (out, s, i) => out + s + (i < values.length ? encodeURIComponent(values[i]) : ""),
    "",
  );
}

/**
 * Minimal REST client for the earth LCD (cosmos gRPC-gateway).
 *
 * All chain reads go through here. `path` is relative to EARTH_LCD_URL, e.g.
 * "/cosmos/bank/v1beta1/balances/earth1...".
 */
export async function get(path) {
  const res = await fetch(EARTH_LCD_URL + path);
  if (!res.ok) {
    throw new Error(`LCD ${res.status} on ${path}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Like get(), but resolves to `fallback` instead of throwing. Used for reads
 * where "no data yet" is a normal state (an address that has never voted, a
 * pool that does not exist) and the UI should render empty rather than error.
 */
export async function getOr(path, fallback) {
  try {
    return await get(path);
  } catch (err) {
    console.warn(`LCD read failed (${path}):`, err.message);
    return fallback;
  }
}

/**
 * Reads from the CometBFT RPC instead of the LCD, resolving to null on any
 * failure — including no RPC being configured at all.
 *
 * Only the explorer's block-range query uses this. Callers must treat null as
 * "fall back to the LCD" rather than "no data", since a deployment exposing
 * only the REST port is a supported configuration.
 */
export async function rpcOrNull(path) {
  if (!EARTH_RPC_URL) return null;
  try {
    const res = await fetch(EARTH_RPC_URL + path);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`RPC read failed (${path}):`, err.message);
    return null;
  }
}
