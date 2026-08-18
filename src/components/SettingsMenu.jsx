import { useEffect, useRef, useState } from "react";
import { CURRENCIES, useDisplayCurrency } from "../contexts/DisplayCurrencyContext";
import "./SettingsMenu.css";

/**
 * Settings, behind a button rather than laid out in the sidebar.
 *
 * The sidebar is navigation; controls sitting in it compete with the links for
 * attention and grow the rail every time a setting is added. A popout keeps the
 * rail a list of destinations and gives settings somewhere to accumulate.
 *
 * The trigger is the cog alone. It lives in the sidebar header opposite the
 * collapse toggle, which is the one spot that is present in every state — the
 * rail collapses, the wallet block appears and disappears with connection, but
 * the header is always there.
 */
export default function SettingsMenu() {
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

  return (
    <div className="settings-menu" ref={rootRef}>
      <button
        type="button"
        className={`settings-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Settings"
        title="Settings"
      >
        <i className="bx bx-cog"></i>
      </button>

      {open && (
        <div className="settings-panel" role="dialog" aria-label="Settings">
          <div className="settings-panel-title">Settings</div>

          <div className="settings-field">
            <label className="settings-label" htmlFor="display-currency">
              Display currency
            </label>
            <select
              id="display-currency"
              className="settings-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {Object.values(CURRENCIES).map((c) => (
                <option key={c.code} value={c.code} disabled={!c.enabled}>
                  {c.label}
                  {c.enabled ? "" : " (soon)"}
                </option>
              ))}
            </select>
            {/* The disabled option cannot carry an explanation of its own — an
                OS-rendered <option> ignores most styling and shows no tooltip —
                so the reason lives here instead of being silently absent. */}
            {!CURRENCIES.USD.enabled && (
              <p className="settings-hint">{CURRENCIES.USD.reason}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
