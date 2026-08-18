import { useDisplayCurrency } from "../contexts/DisplayCurrencyContext";
import "./Amount.css";

/**
 * A value rendered in the user's display currency, with its unit as a symbol
 * rather than a word.
 *
 * USD gets "$" the way it always did. ERTH gets the coin mark, which is the
 * same treatment `/images/coin/ERTH.png` already gets on the staking page — a
 * symbol in front of the number, not a suffix after it. That keeps columns of
 * figures aligned on the digits, which a trailing " ERTH" does not.
 */

const compactNumber = (n) => {
  if (!n) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
};

export default function Amount({ value, compact = true, className = "" }) {
  const { currency } = useDisplayCurrency();

  const text = compact
    ? compactNumber(value)
    : Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  if (currency === "USD") {
    return <span className={`amount ${className}`}>${text}</span>;
  }

  return (
    <span className={`amount ${className}`}>
      <img src="/images/coin/ERTH.png" alt="ERTH" className="amount-symbol" />
      {text}
    </span>
  );
}
