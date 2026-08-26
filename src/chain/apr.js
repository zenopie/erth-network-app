/**
 * Pool APR, in the same two parts the chain actually pays.
 *
 * This is a port of the mobile app's AprMath (ui/compose/PoolApr.kt). The two
 * clients disagreeing about the same pool is worse than either being slightly
 * wrong, so the arithmetic and its order are kept deliberately identical rather
 * than idiomatic.
 *
 * A provider earns from two independent sources:
 *
 *  - **Fees.** Half of every swap fee stays in the pool; the other half is
 *    burned. This is live from the first trade and owes nothing to governance.
 *  - **Emissions.** The Groundworks stream routes some of its ERTH to LP
 *    rewards, split across pools by volume. This is zero until voters allocate
 *    weight to that option.
 *
 * The web app previously modelled only the second, which is why it showed "--"
 * on a pool that was visibly earning: the emission share was genuinely zero,
 * and the fee income it was ignoring was not.
 */

/** One stream's emission, in uerth per second. Mirrors types.EmissionPerSecondPerPillar. */
const EMISSION_UERTH_PER_SEC = 1_000_000;

const SECONDS_PER_DAY = 86_400;
const DAYS_PER_YEAR = 365;

/** Days in the rolling volume window. Mirrors types.VolumeDecayWindowDays. */
export const VOLUME_WINDOW_DAYS = 14;

/**
 * The pool's 14-day-weighted volume, in real uerth.
 *
 * A read, not a calculation. This used to reproduce the chain's decay
 * client-side, and the chain stopped decaying: it scales new volume by a
 * chain-wide index instead, so the stored figure carries a multiplier that grows
 * forever. Nothing here divided it out, and the fee APR inflated with it.
 *
 * The chain de-scales it before returning it (PoolView.volume_erth), so there is
 * nothing left to mirror. Reimplementing chain arithmetic in a client is what
 * caused the drift; not having any to reimplement is the fix.
 */
export function volumeErth(pool) {
  try {
    return BigInt(pool.volumeErth ?? "0");
  } catch {
    return 0n;
  }
}

/**
 * The rate for one pool, given every pool (for the volume denominator) and the
 * LP option's share of the Groundworks stream.
 *
 * Everything is in base units (uerth). Both parts are ratios, so the unit
 * cancels — but the emission constant is in uerth, so the TVL it divides has to
 * be too. Returns null for an empty pool, since a rate on nothing is not a
 * number anyone can act on.
 *
 * `lpOptionShare` is the option's weight over the stream's total weight: 1.0
 * when voters have given it everything, 0 when they have given it nothing.
 */
export function aprFor(pool, allPools, lpOptionShare, swapFeePercent) {
  const reserveErth = Number(pool.erthReserve ?? 0);
  if (!(reserveErth > 0)) return null;

  // Both sides of a constant-product pool are worth the same, so the whole pool
  // is twice the hub side. Pricing the spoke side through the pool's own ratio
  // would just restate the same number.
  const tvl = reserveErth * 2;

  const mine = volumeErth(pool);
  const total = allPools.reduce((acc, p) => acc + volumeErth(p), 0n);

  // --- fees ---
  //
  // At a steady trading rate the weighting settles at roughly window * daily, so
  // daily volume is the reported figure over the window. Right after a burst it
  // overstates, and after a quiet spell it understates; there is no per-day
  // history on chain to do better.
  const dailyVolume = Number(mine) / VOLUME_WINDOW_DAYS;

  // Half the fee is burned, half stays with the providers.
  const lpFeeFraction = swapFeePercent / 100 / 2;

  const fee = (dailyVolume * lpFeeFraction * DAYS_PER_YEAR) / tvl;

  // --- emissions ---
  const share = total === 0n ? 0 : Number(mine) / Number(total);

  const yearlyEmission =
    EMISSION_UERTH_PER_SEC * SECONDS_PER_DAY * DAYS_PER_YEAR * lpOptionShare * share;
  const emission = yearlyEmission / tvl;

  return { fee, emission, total: fee + emission, volumeShare: share };
}
