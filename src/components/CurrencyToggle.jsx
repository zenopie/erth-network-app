import { useEffect, useRef, useState } from "react";
import { CURRENCIES, useDisplayCurrency } from "../contexts/DisplayCurrencyContext";
import "./CurrencyToggle.css";

/** A currency's mark: a coin logo where there is one, the sign where there is not. */
function Symbol({ currency }) {
  return currency.logo ? (
    <img src={currency.logo} alt="" className="currency-symbol-logo" />
  ) : (
    <span className="currency-symbol">{currency.symbol}</span>
  );
}

/**
 * Which unit the page shows values in, pinned to the top-right of every page.
 *
 * Closed it is the mark alone — the page beside it is already denominated in
 * whatever this shows, so the control does not have to name itself. Open it
 * names each option by its ticker, since a column of bare marks gives the
 * reader nothing to read at exactly the moment they are choosing between them.
 *
 * Built rather than a native <select> so the unavailable option can carry its
 * own explanation: an OS-rendered <option> ignores styling and shows no
 * tooltip, so the reason had to sit outside the control as a paragraph.
 *
 * Fixed, not absolute: it belongs to the viewport rather than to the scrolling
 * page, and every page already reserves 80px of top padding for it.
 */
export default function CurrencyToggle() {
  const { currency, setCurrency } = useDisplayCurrency();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Close on a click anywhere else, or on Escape. Both listeners are only
  // attached while open, so a closed menu costs nothing.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const active = CURRENCIES[currency] ?? CURRENCIES.ERTH;

  return (
    <div className="currency-menu" ref={rootRef}>
      <button
        type="button"
        className={`currency-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Display currency: ${active.label}`}
      >
        <Symbol currency={active} />
        <i className="bx bx-chevron-down"></i>
      </button>

      {open && (
        <ul className="currency-panel" role="listbox" aria-label="Display currency">
          {Object.values(CURRENCIES).map((c) => (
            <li key={c.code}>
              <button
                type="button"
                role="option"
                aria-selected={currency === c.code}
                className={`currency-option ${currency === c.code ? "active" : ""}`}
                disabled={!c.enabled}
                title={c.enabled ? undefined : c.reason}
                onClick={() => {
                  setCurrency(c.code);
                  setOpen(false);
                }}
              >
                <Symbol currency={c} />
                <span className="currency-option-name">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
