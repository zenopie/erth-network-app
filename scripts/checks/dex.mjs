// The dex (src/chain/dex.js) against x/dex's own maths and a stubbed LCD. No
// chain required; scripts/checks/dex-live.mjs reads a real one.
//
// What this guards: a quote or fee that differs from the chain's by a unit
// (vectors from x/dex amm.go: scripts/fixtures/dex-*.json), a deposit leg
// rounded down (x/dex pulls each leg rounded up), a floor signed for an amount
// or pair it was not quoted for, or after it went stale (the quote used to be
// replaced only when the next one resolved, so between an amount change and
// the new quote the form signed the NEW amount with the OLD amount's floor),
// a deposit floor priced on the reserves the page loaded rather than those at
// submit, and an ANML withdrawal whose note leg the chain will refuse.
import { check, done, throws, stubLcd } from "./lib.mjs";
import D from "../fixtures/dex-deposits.json";
import W from "../fixtures/dex-swaps.json";

const dex = await import("../../src/chain/dex.js");
const { minimumReceived, toMicro } = await import("../../src/chain/tokens.js");
console.warn = () => {};

// ---- exact AMM maths (x/dex amm.go) --------------------------------------------
{
  // feeOf rounds amount * fee% up; burn takes the odd unit; out = rT*eff/(rE+eff).
  const hop = dex.exactHubToToken("1000000000", "500000000", "1000000", "0.3");
  // fee = 3000, eff = 997000, out = floor(500000000*997000 / 1000997000) = 498003
  check("exact ERTH->token hop", hop.out === 498003n && hop.fee === 3000n && hop.burn === 1500n, JSON.stringify(hop, (_, v) => (typeof v === "bigint" ? String(v) : v)));
  const odd = dex.exactHubToToken("1000000000", "500000000", "1001", "0.3");
  // fee = ceil(3.003) = 4, burn = 2
  check("exact hop: fee rounds up, burn takes the odd unit", odd.fee === 4n && odd.burn === 2n);
  const back2 = dex.exactTokenToHub("1000000000", "500000000", "1000000", "0.3");
  // gross = 1e9*1e6/(5e8+1e6) = 1996007 ; fee = ceil(5988.021) = 5989 ; out = 1990018
  check("exact token->ERTH hop", back2.out === 1990018n && back2.fee === 5989n, String(back2.out));
  check("swap fee parses chain decimals", dex.parseDec18("0.300000000000000000") === 300000000000000000n &&
    dex.parseDec18("1") === 10n ** 18n && throws(() => dex.parseDec18("abc")));
}

// ---- swaps: x/dex's own vectors (the fee rounds up) -------------------------------
{
  let ok = 0;
  for (const f of W.fees) {
    const got = dex.exactFee(f.amount, f.fee).toString();
    if (got === f.fee_of) ok++;
    else console.log("  fee mismatch", JSON.stringify(f), got);
  }
  check(`feeOf matches x/dex (${W.fees.length})`, ok === W.fees.length && W.fees.length > 0, `${ok}`);
  ok = 0;
  for (const v of W.hops) {
    const r = v.dir === "hub_for_token"
      ? dex.exactHubToToken(v.reserve_erth, v.reserve_token, v.amount_in, v.fee)
      : dex.exactTokenToHub(v.reserve_erth, v.reserve_token, v.amount_in, v.fee);
    if ([r.out, r.fee, r.burn].join() === [v.amount_out, v.fee_erth, v.burn].join()) ok++;
    else console.log("  hop mismatch", JSON.stringify(v), [r.out, r.fee, r.burn].join());
  }
  check(`swap hops match x/dex (${W.hops.length})`, ok === W.hops.length && W.hops.length > 0, `${ok}`);
  check("a 1-unit swap at 0.3% pays a 1-unit fee", dex.exactFee("1", "0.3") === 1n && dex.exactFee("0", "0.3") === 0n);
}

// ---- deposits: x/dex's own vectors --------------------------------------------
{
  let ok = 0;
  for (const d of D.deposits) {
    const got = dex.depositPull(d.in_erth, d.in_token, d.reserve_erth, d.reserve_token, d.supply);
    const want = d.shares === "0" ? null : [d.shares, d.pull_erth, d.pull_token].join();
    const g = got ? [got.shares, got.erth, got.token].join() : null;
    if (g === want) ok++;
    else console.log("  mismatch", JSON.stringify(d), g);
    // From the ERTH side, the derived token leg buys every share the ERTH buys.
    const leg = dex.depositLeg(d.in_erth, d.reserve_erth, d.reserve_token);
    const byE = (BigInt(d.in_erth) * BigInt(d.supply)) / BigInt(d.reserve_erth);
    if (byE > 0n) {
      const p = dex.depositPull(d.in_erth, leg, d.reserve_erth, d.reserve_token, d.supply);
      if (!p || p.shares !== byE || p.erth > BigInt(d.in_erth) || p.token > BigInt(leg)) { ok--; console.log("  leg", JSON.stringify(d), leg); }
    }
  }
  check(`deposits match x/dex (${D.deposits.length})`, ok === D.deposits.length && D.deposits.length === 144, `${ok}`);
  check("depositLeg rounds up", dex.depositLeg("5", "2", "1") === "3" && dex.depositLeg("4", "2", "1") === "2" &&
    dex.depositLeg("1", "0", "1") === "0" && dex.depositLeg("x", "1", "1") === "0");
  check("quoteAddLiquidity agrees with depositPull's shares",
    dex.quoteAddLiquidity("1000000", "700000", "1000000000000", "500000000000", "700000000000") ===
      dex.depositPull("1000000", "700000", "1000000000000", "500000000000", "700000000000").shares.toString());
}

// ---- quotes: the chain's SimulateSwapExactIn when the node serves it, else the
// local maths over the pool reserves.
const routes = stubLcd({
  "/earth/dex/v1/pool": { pool: [{ pool_id: "1", reserve_erth: { denom: "uerth", amount: "1000000" }, reserve_token: { denom: "uanml", amount: "1000000" } }] },
  "/earth/dex/v1/params": { params: { swap_fee: "0.300000000000000000" } },
});
{
  const localAnml = dex.exactHubToToken("1000000", "1000000", "10000", "0.3").out;
  check("no simulation: buy-ANML quote is the local maths", (await dex.quoteBuyAnml("10000")) === localAnml, String(localAnml));
  const localSwap = await dex.quoteSwap("10000", "uerth", "uanml");
  check("no simulation: swap quote is the local maths", localSwap === localAnml, String(localSwap));
  let asked;
  routes["/earth/dex/v1/simulate_swap_exact_in"] = (q) => {
    asked = Object.fromEntries(q);
    return { token_out: { denom: q.get("ask_denom"), amount: "9950" }, fee: { denom: "uerth", amount: "30" }, erth_burned: "15" };
  };
  const sim = await dex.simulateSwapExactIn("10000", "uerth", "uanml");
  check("simulation parsed", sim.out === 9950n && sim.fee === 30n && sim.burn === 15n, JSON.stringify(asked));
  check("simulation query names offer and ask", asked.offer_denom === "uerth" && asked.offer_amount === "10000" && asked.ask_denom === "uanml");
  check("buy-ANML quote is the chain's", (await dex.quoteBuyAnml("10000")) === 9950n);
  check("swap quote is the chain's", (await dex.quoteSwap("10000", "uerth", "uanml")) === 9950n);
  check("a non-positive amount is not asked", (await dex.simulateSwapExactIn("0", "uerth", "uanml")) === null);
  routes["/earth/dex/v1/simulate_swap_exact_in"] = () => ({ token_out: { denom: "uanml", amount: "0" }, fee: { denom: "uerth", amount: "0" } });
  check("a zero simulation falls back", (await dex.quoteBuyAnml("10000")) === localAnml);
}

// ---- swap floor: only from a fresh quote of this exact amount and pair ------------
{
  const sq = { micro: "1000", from: "uerth", to: "ufoo", out: 500n, at: 1_000_000 };
  check("fresh swap quote gives a floor", dex.swapFloor(sq, "1000", "uerth", "ufoo", 1, 1_000_000 + dex.QUOTE_TTL_MS) === "495");
  check("an expired swap quote gives none", dex.swapFloor(sq, "1000", "uerth", "ufoo", 1, 1_000_001 + dex.QUOTE_TTL_MS) === "0" &&
    dex.swapFloor(sq, "1000", "uerth", "ufoo", 1, 999_999) === "0");
  check("another amount or pair gives none", dex.swapFloor(sq, "1001", "uerth", "ufoo", 1, 1_000_000) === "0" &&
    dex.swapFloor(sq, "1000", "ufoo", "uerth", 1, 1_000_000) === "0" && dex.swapFloor(null, "1000", "uerth", "ufoo", 1) === "0" &&
    dex.swapFloor({ ...sq, out: 0n }, "1000", "uerth", "ufoo", 1, 1_000_000) === "0");
}

// ---- Buy ANML and add liquidity: the quote-driven forms' floors -----------------
{
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

  // Buy ANML: the component's state machine (BuyAnml.jsx). Amount edits drop
  // the quote synchronously; a quote lands only for the amount it was asked for.
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
  check("after an amount change, nothing may be signed until the new quote lands", floor(s.micro) === "0", floor(s.micro));
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

  // Add liquidity: the floor follows the pool as it is now.
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

// ---- ANML withdrawals: the note-leg cap, 32 notes of 2^63 - 1 ----------------------
{
  const cap = ((1n << 63n) - 1n) * 32n;
  check("note-leg cap is 32 x (2^63-1)", dex.MAX_WITHDRAWAL_NOTE_LEG === cap);
  check("a leg at the cap starts", dex.withdrawalNoteLegProblem("1", cap.toString(), "1") === null);
  check("a leg past the cap is refused before signing", /smaller parts/.test(dex.withdrawalNoteLegProblem("1", (cap + 1n).toString(), "1") ?? ""));
  check("pre-sign note-leg text names 32 x (2^63 - 1)", /32 notes of 2\^63 - 1/.test(dex.withdrawalNoteLegProblem("1", (cap + 1n).toString(), "1") ?? ""));
  check("leg is floor(shares x reserve / supply)", dex.withdrawalNoteLegProblem("2", (cap * 2n + 1n).toString(), "4") === null &&
    dex.withdrawalNoteLegProblem("3", (cap * 2n).toString(), "4") !== null && dex.withdrawalNoteLegProblem("1", "1", "0") === null);

  // The reserve is re-read with the supply at sign time; a failed read refuses.
  stubLcd(routes);
  routes["/earth/dex/v1/pool/7"] = { pool: { pool_id: "7", reserve_erth: { denom: "uerth", amount: "1" }, reserve_token: { denom: "uanml", amount: (cap + 1n).toString() } } };
  routes["/cosmos/bank/v1beta1/supply/by_denom"] = (q) => (q.get("denom") === "dexlp/7" ? { amount: { denom: "dexlp/7", amount: "1" } } : null);
  check("a leg over the cap at the fresh reserve is refused", /smaller parts/.test((await dex.withdrawalNoteLegProblemNow(7, "1")) ?? ""));
  routes["/earth/dex/v1/pool/7"].pool.reserve_token.amount = cap.toString();
  check("at the cap it starts", (await dex.withdrawalNoteLegProblemNow(7, "1")) === null);
  check("a failed pool read refuses", /cannot be checked/.test((await dex.withdrawalNoteLegProblemNow(8, "1")) ?? ""));
  delete routes["/cosmos/bank/v1beta1/supply/by_denom"];
  check("a failed supply read refuses", /cannot be checked/.test((await dex.withdrawalNoteLegProblemNow(7, "1")) ?? ""));
}

done();
