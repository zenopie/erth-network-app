// The quote-driven forms' floors, against a stubbed LCD. No chain required.
//
// 1. Buy ANML (audit 4, poc-buyanml-stale-quote): the quote used to be
//    replaced only when the next one resolved, so between an amount change
//    and the new quote (or forever, if that request hung) the form signed
//    the NEW amount with the OLD amount's floor. The floor is now bound to
//    the amount it was quoted for and to its age (dex.buyAnmlFloor).
// 2. Add liquidity: min_shares is priced on reserves and share supply read
//    at submit (dex.addLiquidityFloor), not on the rows the page loaded.
const dex = await import("../src/chain/dex.js");
const { minimumReceived, toMicro } = await import("../src/chain/tokens.js");

let bad = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? " — " + detail : ""}`);
  if (!cond) bad++;
};

const R = 1_000_000_000_000n; // 1,000,000 ERTH / 1,000,000 ANML
let hang = false;
let pool = { erth: R, token: R, shares: 1_000_000_000_000n };
globalThis.fetch = async (url) => {
  const u = new URL(String(url), "http://x");
  const json = (o) => new Response(JSON.stringify(o));
  if (u.pathname.endsWith("/simulate_swap_exact_in")) {
    if (hang) return new Promise(() => {});
    const a = BigInt(u.searchParams.get("offer_amount"));
    const { out, fee, burn } = dex.exactHubToToken(R, R, a, "0.3");
    return json({ token_out: { denom: "uanml", amount: out.toString() }, fee: { amount: fee.toString() }, erth_burned: burn.toString() });
  }
  if (u.pathname.endsWith("/earth/dex/v1/pool/1")) {
    return json({ pool: { pool_id: "1", reserve_erth: { denom: "uerth", amount: pool.erth.toString() },
      reserve_token: { denom: "uanml", amount: pool.token.toString() }, volume_erth: "0" } });
  }
  if (u.pathname.endsWith("/supply/by_denom")) return json({ amount: { denom: u.searchParams.get("denom"), amount: pool.shares.toString() } });
  return new Response("{}", { status: 404 });
};

// --- 1. Buy ANML: the component's state machine (BuyAnml.jsx), driven the way
// the PoC drove the old one: amount edits drop the quote synchronously; a
// quote lands only for the amount it was asked for.
{
  let quote = null;
  let seq = 0;
  const setAmount = (amount) => {
    const micro = toMicro(amount, "uerth");
    const id = ++seq;
    quote = null; // changeAmount()
    if (micro === "0") return { micro, p: Promise.resolve() };
    return { micro, p: dex.boundBuyAnmlQuote(micro).then((q) => { if (id === seq) quote = q; }) };
  };
  const floor = (micro, t) => dex.buyAnmlFloor(quote, micro, 1, t);

  let s = setAmount("1");
  await s.p;
  const f1 = floor(s.micro);
  check("a fresh quote for the amount gives a floor", f1 !== "0", f1);
  hang = true;
  s = setAmount("10000"); // Max, and the new quote never returns
  check("PoC: after an amount change, nothing may be signed until the new quote lands", floor(s.micro) === "0", floor(s.micro));
  // Even if the old quote object were still around, it is bound to "1 ERTH".
  const old = { micro: toMicro("1", "uerth"), out: 990_000n, at: Date.now() };
  check("a quote for another amount is never a floor", dex.buyAnmlFloor(old, s.micro, 1) === "0");
  hang = false;
  s = setAmount("10000");
  await s.p;
  const fair = dex.exactHubToToken(R, R, BigInt(s.micro), "0.3").out;
  check("the fresh quote's floor is the proper floor", floor(s.micro) === minimumReceived(fair.toString(), 1), floor(s.micro));
  check("a quote older than QUOTE_TTL_MS is no floor", floor(s.micro, quote.at + dex.QUOTE_TTL_MS + 1) === "0");
  check("a quote from the future is no floor", floor(s.micro, quote.at - 1) === "0");
  check("a zero quote is no floor", dex.buyAnmlFloor({ ...quote, out: 0n }, s.micro, 1) === "0");
}

// --- 2. Add liquidity: the floor follows the pool as it is now.
{
  const e = "1000000000", t = "1000000000";
  const f0 = BigInt(await dex.addLiquidityFloor(1, e, t, 2));
  check("floor from the current reserves", f0 === 980_000_000n, String(f0));
  // The pool moves after the page loaded (a big trade): the page's rows would
  // price the floor at the old ratio; the fresh read prices it at the new one.
  pool = { erth: 4n * R, token: R / 4n, shares: R };
  const stale = BigInt(dex.quoteAddLiquidity(e, t, R, R, R)) * 98n / 100n;
  const fresh = BigInt(await dex.addLiquidityFloor(1, e, t, 2));
  const expect = (BigInt(dex.quoteAddLiquidity(e, t, pool.erth, pool.token, pool.shares)) * 98n) / 100n;
  check("floor priced on reserves read at submit, not the page's", fresh === expect && fresh !== stale, `fresh ${fresh} stale ${stale}`);
  pool = { ...pool, shares: null };
  globalThis.fetch = ((f) => async (url) => (String(url).includes("/supply/") ? new Response("down", { status: 503 }) : f(url)))(globalThis.fetch);
  check("a failed supply read is no floor (the form refuses)", (await dex.addLiquidityFloor(1, e, t, 2)) === "0");
}

process.exit(bad ? 1 : 0);
