import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * Which unit values are shown in.
 *
 * ERTH is the default and the only one currently selectable. USD is listed but
 * disabled because the chain has no way to price ERTH in dollars: a USD figure
 * needs a pool against a dollar-denominated asset, and the only pool is
 * ERTH/ANML. The genesis liquidity auction is what creates that reference, so
 * USD becomes real once it settles — not before.
 *
 * Until then, showing dollars means showing a number nobody computed. The page
 * used to do exactly that by accident: it multiplied by a price fetched from a
 * backend route that no longer exists, and `?? 0` turned every value into $0.00
 * with no error anywhere.
 */
export const CURRENCIES = {
  ERTH: {
    code: "ERTH",
    label: "ERTH",
    enabled: true,
  },
  USD: {
    code: "USD",
    label: "USD",
    enabled: false,
    // Shown as a tooltip on the disabled option.
    reason: "Needs a USD-denominated pool — available after the liquidity auction",
  },
};

const STORAGE_KEY = "earth.displayCurrency";
const DEFAULT = "ERTH";

const DisplayCurrencyContext = createContext({
  currency: DEFAULT,
  setCurrency: () => {},
});

export function DisplayCurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // A stored value for a currency that is no longer selectable falls back
      // rather than stranding the UI in a unit it cannot render.
      if (saved && CURRENCIES[saved]?.enabled) return saved;
    } catch {
      // Private browsing and blocked storage both throw here; the default is fine.
    }
    return DEFAULT;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, currency);
    } catch {
      // Preference simply does not persist. Not worth surfacing.
    }
  }, [currency]);

  const setCurrency = (code) => {
    if (CURRENCIES[code]?.enabled) setCurrencyState(code);
  };

  const value = useMemo(() => ({ currency, setCurrency }), [currency]);

  return (
    <DisplayCurrencyContext.Provider value={value}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

export function useDisplayCurrency() {
  return useContext(DisplayCurrencyContext);
}
