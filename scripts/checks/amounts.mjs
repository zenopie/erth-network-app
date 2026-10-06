// Amounts (src/chain/tokens.js) and the pages' amount inputs. No chain, no
// stub: pure functions plus a read of the page sources.
//
// What this guards: an amount signed as something other than what was typed
// (an exponent read as 0, digits past the denom's decimals dropped, a float
// rounding a base unit away, Max losing digits past 2^53), an unknown denom
// assumed to have 6 decimals, and weights past 2^53 summed or compared as
// floats.
import { check, done } from "./lib.mjs";
import { readFileSync } from "node:fs";

const tk = await import("../../src/chain/tokens.js");

// ---- unknown denoms: never assumed to have 6 decimals ------------------------
{
  const ibc = "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";
  check("an unknown denom is not known, shown raw (decimals 0, raw denom)",
    !tk.isKnownDenom(ibc) && tk.decimalsOf(ibc) === 0 && tk.symbolOf(ibc) === ibc && !tk.isKnownDenom("ufoo") && tk.symbolOf("ufoo") === "ufoo");
  check("no amount can be entered for an unknown denom", tk.toMicro("1", ibc) === "0" && tk.toMicro("5", "ufoo") === "0" && tk.toMicro("5", undefined) === "0");
  check("known denoms and LP shares still parse", tk.toMicro("1.5", "uerth") === "1500000" && tk.toMicro("2", "dexlp/3") === "2000000" &&
    tk.isKnownDenom("dexlp/12") && !tk.isKnownDenom("dexlp/x"));
  check("raw display of an unknown denom", tk.formatUnits("123456789", ibc) === "123456789" && tk.toMacro("123456789", ibc) === 123456789);
}

// ---- typed amounts: the button agrees with what is signed, Max is exact -------
{
  check("an exponent is not an amount (the button stays off; it would sign 0)",
    !tk.amountOk("1e3", "uerth") && !tk.amountOk("1e+21", "uerth") && !tk.amountOk("-1", "uerth") && !tk.amountOk("0.0000001", "uerth") &&
      tk.amountOk("0.000001", "uerth") && tk.amountOk("1000", "uerth"));
  check("the balance bound is exact in base units",
    tk.amountOk("1.000001", "uerth", "1000001") && !tk.amountOk("1.000002", "uerth", "1000001") &&
      tk.amountOk("123456789012345.678901", "uerth", "123456789012345678901") && !tk.amountOk("123456789012345.678902", "uerth", "123456789012345678901"));
  // Max from base units: exact past 2^53 and past 1e21, where String(float) was "1e+21".
  const huge = "1000000000000000000000000001";
  check("Max (formatUnits) round-trips exactly, past 2^53 and 1e21",
    tk.toMicro(tk.formatUnits(huge, "uerth"), "uerth") === huge && tk.amountOk(tk.formatUnits(huge, "uerth"), "uerth", huge) &&
      String(tk.toMacro(huge, "uerth")).includes("e+") && tk.toMicro(String(tk.toMacro(huge, "uerth")), "uerth") === "0");
  check("an estimate is of the signed amount", tk.typedFloat("1e3", "uerth") === 0 && tk.typedFloat("2.5", "uerth") === 2.5);

  // Extra decimals are refused and said, never dropped.
  check("1.1234567 ERTH is refused, not signed as 1.123456", tk.toMicro("1.1234567", "uerth") === "0" && !tk.amountOk("1.1234567", "uerth"));
  check("trailing zeros past the decimals are fine", tk.toMicro("1.1234560", "uerth") === "1123456" && tk.amountNote("1.1234560", "uerth") === "");
  check("the user is told", /at most 6 decimal places/.test(tk.amountNote("1.1234567", "uerth")) && tk.amountNote("1.5", "uerth") === "" && tk.amountNote("", "uerth") === "");
}

// ---- the pages: no float gating, a note under every typed amount (source checks; run from the app root)
{
  const pages = ["Governance", "StakeErth", "LiquidityAuction", "Markets", "SwapTokens", "Shield"].map((n) => [n, readFileSync(`src/pages/${n}.jsx`, "utf8")]);
  const floaty = pages.filter(([, src]) => /parseFloat\(|String\(\w*[bB]alance\)|String\(row\.userShares\)/.test(src)).map(([n]) => n);
  check("no page gates or fills an amount through a float", floaty.length === 0, floaty.join(","));
  const numInputs = pages.flatMap(([n, src]) => (src.match(/type="number"/g) ?? []).map(() => n));
  check("the only number input left is the swap slippage", numInputs.join() === "SwapTokens", numInputs.join());
  const allInputs = [...pages, ["BuyAnml", readFileSync("src/components/BuyAnml.jsx", "utf8")]];
  const unnoted = allInputs.filter(([, src]) => {
    const inputs = (src.match(/inputMode="decimal"/g) ?? []).length;
    const notes = (src.match(/<AmountNote /g) ?? []).length;
    return inputs - (src.includes("value={toAmount}") ? 1 : 0) !== notes;
  }).map(([n]) => n);
  check("every typed amount input has an AmountNote", unnoted.length === 0, unnoted.join(","));
}

// ---- weights past 2^53 (rate x derth): the page math stays in BigInt -----------
// 2^53 + 1 is the first integer Number() cannot hold.
{
  const big = "9007199254740993"; // 2^53 + 1
  const w = ["123456789012345678901234567890", "1"];
  check("toBigInt keeps 2^53 + 1 exact; junk is 0", tk.toBigInt(big) === 9007199254740993n &&
    tk.toBigInt("1.5") === 0n && tk.toBigInt("-3") === 0n && tk.toBigInt(undefined) === 0n && tk.toBigInt(1e21) === 0n);
  check("sumBig is exact past 2^53", tk.sumBig([big, big, "1"]) === 18014398509481987n &&
    tk.sumBig(w) === 123456789012345678901234567891n);
  check("Number would have lost it", Number(big) + Number(big) + 1 !== 18014398509481987);
  check("byBigDesc orders weights Number() ties", [big, "9007199254740992", "9007199254740994"].sort(tk.byBigDesc).join() ===
    "9007199254740994,9007199254740993,9007199254740992");
  check("percentString: exact share of a huge total, rounded half up",
    tk.percentString(w[1], w[0]) === "0.0" && tk.percentString(1, 3) === "33.3" && tk.percentString(2, 3) === "66.7" &&
    tk.percentString("50000000000000000000000000001", "100000000000000000000000000000", 4) === "50.0000" &&
    tk.percentString(1, 8, 2) === "12.50" && tk.percentString(5, 0) === null && tk.percentString(3, 3, 0) === "100");
  check("ratio divides exactly before the float", tk.ratio("1", "4") === 0.25 && tk.ratio(big, big) === 1 && tk.ratio(1, 0) === 0 &&
    Math.abs(tk.ratio("123456789012345678901234567890", "246913578024691357802469135780") - 0.5) < 1e-15);
  const fm = tk.formatMacro("123456789012345678901234567", "uerth");
  check("formatMacro: every integer digit of a weight past 2^53", fm.replace(/\D/g, "") === "123456789012345678901" + "234",
    fm);
  check("formatMacro: small amounts as toLocaleString shows them",
    tk.formatMacro("1500000", "uerth") === (1.5).toLocaleString() && tk.formatMacro("0", "uerth") === "0" &&
    tk.formatMacro("1", "uerth") === "0");
  // LCD strings that are not integers do not throw out of the page math.
  check("toBigInt guards LCD junk", tk.toBigInt("12.5") === 0n && tk.toBigInt("1e9") === 0n && tk.toBigInt(null) === 0n);
}

// ---- logos: every one shown is a file the app ships ---------------------------
{
  const { existsSync } = await import("node:fs");
  const shipped = (logo) => existsSync(`public${logo}`);
  const denoms = [...Object.keys(tk.TOKENS), "dexlp/3", "ibc/ABC"];
  const missing = denoms.filter((d) => !shipped(tk.logoOf(d)));
  check("every token's logo is a shipped file", missing.length === 0, missing.join(", "));
  check("a token without artwork gets the neutral coin, not ERTH's",
    tk.logoOf("uusdc") === tk.GENERIC_LOGO && tk.logoOf("ibc/ABC") === tk.GENERIC_LOGO);
check("a bare uusdc is not labelled USDC", !tk.tokenInfo("uusdc").known && tk.symbolOf("uusdc") === "uusdc");
}

done();
