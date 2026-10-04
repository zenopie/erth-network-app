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

// --- 3. Unknown denoms (audit 5, L9): never assumed to have 6 decimals.
{
  const tk = await import("../src/chain/tokens.js");
  const ibc = "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";
  check("L9: an unknown denom is not known, shown raw (decimals 0, raw denom)",
    !tk.isKnownDenom(ibc) && tk.decimalsOf(ibc) === 0 && tk.symbolOf(ibc) === ibc && !tk.isKnownDenom("ufoo") && tk.symbolOf("ufoo") === "ufoo");
  check("L9: no amount can be entered for an unknown denom", tk.toMicro("1", ibc) === "0" && tk.toMicro("5", "ufoo") === "0" && tk.toMicro("5", undefined) === "0");
  check("L9: known denoms and LP shares still parse", tk.toMicro("1.5", "uerth") === "1500000" && tk.toMicro("2", "dexlp/3") === "2000000" &&
    tk.isKnownDenom("dexlp/12") && !tk.isKnownDenom("dexlp/x"));
  check("L9: raw display of an unknown denom", tk.formatUnits("123456789", ibc) === "123456789" && tk.toMacro("123456789", ibc) === 123456789);
}

// --- 4. Amounts (audit 5, L3): the button agrees with what is signed, Max is exact.
{
  const tk = await import("../src/chain/tokens.js");
  check("L3: an exponent is not an amount (the button stays off; it would sign 0)",
    !tk.amountOk("1e3", "uerth") && !tk.amountOk("1e+21", "uerth") && !tk.amountOk("-1", "uerth") && !tk.amountOk("0.0000001", "uerth") &&
      tk.amountOk("0.000001", "uerth") && tk.amountOk("1000", "uerth"));
  check("L3: the balance bound is exact in base units",
    tk.amountOk("1.000001", "uerth", "1000001") && !tk.amountOk("1.000002", "uerth", "1000001") &&
      tk.amountOk("123456789012345.678901", "uerth", "123456789012345678901") && !tk.amountOk("123456789012345.678902", "uerth", "123456789012345678901"));
  // Max from base units: exact past 2^53 and past 1e21, where String(float) was "1e+21".
  const huge = "1000000000000000000000000001";
  check("L3: Max (formatUnits) round-trips exactly, past 2^53 and 1e21",
    tk.toMicro(tk.formatUnits(huge, "uerth"), "uerth") === huge && tk.amountOk(tk.formatUnits(huge, "uerth"), "uerth", huge) &&
      String(tk.toMacro(huge, "uerth")).includes("e+") && tk.toMicro(String(tk.toMacro(huge, "uerth")), "uerth") === "0");
  check("L3: an estimate is of the signed amount", tk.typedFloat("1e3", "uerth") === 0 && tk.typedFloat("2.5", "uerth") === 2.5);
  const { readFileSync } = await import("node:fs");
  const pages = ["Governance", "StakeErth", "LiquidityAuction", "Markets", "SwapTokens", "Shield"].map((n) => [n, readFileSync(`src/pages/${n}.jsx`, "utf8")]);
  const bad3 = pages.filter(([, src]) => /parseFloat\(|String\(\w*[bB]alance\)|String\(row\.userShares\)/.test(src)).map(([n]) => n);
  check("L3: no page gates or fills an amount through a float", bad3.length === 0, bad3.join(","));
  const numInputs = pages.flatMap(([n, src]) => (src.match(/type="number"/g) ?? []).map(() => n));
  check("L3: the only number input left is the swap slippage", numInputs.join() === "SwapTokens", numInputs.join());

  // Audit 6 L-2: the human tally is read only while the proposal is voting;
  // a closed round's ballot is gone and the query answers a zero tally.
  const govSrc = pages.find(([n]) => n === "Governance")[1];
  const tallyCalls = govSrc.match(/[^\n]*assembly\.proposalTally\([^\n]*/g) ?? [];
  check("L-2 (audit 6): proposalTally only under isVoting", tallyCalls.length === 1 && /isVoting \? assembly\.proposalTally/.test(tallyCalls[0]), tallyCalls.join(" | "));
  check("L-2 (audit 6): a closed proposal renders no live human tally", /isVoting \?\s*\(\s*<HumanTally/.test(govSrc) && /<ClosedHumanTally/.test(govSrc));
}

process.exit(bad ? 1 : 0);
