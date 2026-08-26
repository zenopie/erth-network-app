export const formatPrice = (price) => {
  if (!price) return "$0.00";
  if (price < 0.0001) return `$${price.toFixed(8)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
};

export const formatCompact = (n) => {
  if (!n) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
};

/**
 * An annual rate, as a percent.
 *
 * A rate can be real and still round to nothing: a deep pool earning fees on
 * thin volume yields a genuinely tiny number, and "0.0%" reads as a confident
 * zero rather than "too small to show at this precision". The distinction that
 * matters to a reader is earning-nothing versus earning-almost-nothing, so the
 * floor is spelled out instead of rounded away.
 */
export const formatApr = (pct) => {
  if (!pct || pct <= 0) return "--";
  if (pct < 0.01) return "<0.01%";
  return `${pct.toFixed(1)}%`;
};

/**
 * A span of seconds in the largest unit that still reads as a round number —
 * "7 days" rather than "604800 seconds". Used for chain periods (LP escrow, an
 * auction window), which are configured in seconds but only ever read as a wait.
 */
export const formatDuration = (seconds) => {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "0s";
  const units = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [name, size] of units) {
    if (s >= size) {
      const n = Math.round(s / size);
      return `${n} ${name}${n === 1 ? "" : "s"}`;
    }
  }
  return `${Math.round(s)} seconds`;
};
