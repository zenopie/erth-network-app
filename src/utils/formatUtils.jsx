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
