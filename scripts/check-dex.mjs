// Verifies the dex chain layer against a live LCD.
//
// The reads here are the ones whose field names have drifted before: PoolView
// replaced the stored Pool (volume_erth, not volume), and the auction, escrowed
// withdrawals and POL schedules were never read by this app at all. A shape
// mismatch shows up as a plausible-looking zero rather than an error, which is
// exactly the failure this catches.
const dex = await import("../src/chain/dex.js");
const apr = await import("../src/chain/apr.js");

let bad = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) bad++;
};

const pools = await dex.pools();
console.log(`pools: ${pools.length}`);
for (const p of pools) {
  console.log(
    `  #${p.id} ${p.tokenDenom.padEnd(8)} erth=${p.erthReserve} ` +
      `vol=${p.volumeErth} lastTradedDay=${p.lastTradedDay}`,
  );
}

check("at least one pool", pools.length > 0);
check(
  "pool ids and reserves parse",
  pools.every((p) => p.id > 0 && Number(p.erthReserve) > 0 && p.tokenDenom),
);
// A pool that has ever traded reports weighted volume. All zero across a chain
// with trades is the PoolView rename regressing, not a quiet market.
check(
  "volumeErth parses (not the old `volume` field)",
  pools.every((p) => /^\d+$/.test(String(p.volumeErth))),
  pools.map((p) => p.volumeErth).join(", "),
);
check(
  "lastTradedDay is a day index, not a timestamp",
  pools.every((p) => p.lastTradedDay === 0 || (p.lastTradedDay > 15000 && p.lastTradedDay < 40000)),
  pools.map((p) => p.lastTradedDay).join(", "),
);

const fee = await dex.swapFeePercent();
check("swap fee parses", fee > 0 && fee < 100, `${fee}%`);

const escrow = await dex.lpUnbondingSeconds();
check("lp unbonding seconds parses", escrow > 0, `${escrow}s`);

// APR must read the chain's figure rather than reproducing its arithmetic.
const rates = pools.length ? apr.aprFor(pools[0], pools, 0.5, fee) : null;
check("apr computes from the reported volume", rates !== null && rates.fee >= 0,
  rates ? `fee ${(rates.fee * 100).toFixed(2)}%, emission ${(rates.emission * 100).toFixed(2)}%` : "no pools");
check("volume share is a fraction", rates === null || (rates.volumeShare >= 0 && rates.volumeShare <= 1),
  rates ? rates.volumeShare.toFixed(4) : "");

const auction = await dex.liquidityAuction();
console.log("auction:", auction);
check("auction status is a known enum name", auction === null ||
  [dex.AUCTION_PENDING, dex.AUCTION_OPEN, dex.AUCTION_SETTLED].includes(auction.status),
  auction?.status);
check("auction earmarks parse", auction === null ||
  (Number(auction.erthForBidders) > 0 && Number(auction.erthForPool) > 0),
  auction ? `${auction.erthForBidders} / ${auction.erthForPool}` : "no auction");

// An address that has never bid 404s; the UI must read that as "no bid" rather
// than an error. The address is the all-zero account — valid bech32, so the
// query reaches the keeper and returns NotFound instead of failing validation.
const stranger = "earth1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgdmef5";
const noBid = await dex.auctionBid(stranger);
check("a non-bidder reads as zero, not an error", noBid.amount === "0" && !noBid.claimed);

const noUnbondings = await dex.lpUnbondings(stranger);
check("an address with no withdrawals reads as empty", Array.isArray(noUnbondings) && noUnbondings.length === 0);

const burns = await dex.polBurns();
console.log("pol burns:", burns);
check("pol burns parse", burns.every((b) =>
  b.poolId > 0 && Number(b.totalShares) > 0 && Number(b.sharesRemaining) >= 0 && b.durationSeconds > 0));
check("pol remaining never exceeds the schedule's base",
  burns.every((b) => Number(b.sharesRemaining) <= Number(b.totalShares)));

process.exit(bad ? 1 : 0);
