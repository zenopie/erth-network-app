// swapTokensUtils.js

/** Basic slippage calc, same as before */
export function calculateMinimumReceived(outputAmount, slippage) {
  if (!outputAmount) return 0;
  const amt = parseFloat(outputAmount);
  if (isNaN(amt)) return 0;
  const slipMult = (100 - slippage) / 100;
  return amt * slipMult;
}

