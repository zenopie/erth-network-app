import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import styles from "./Explorer.module.css";
import forms from "./Forms.module.css";
import * as personhood from "../chain/personhood";
import { useLoading } from "../contexts/LoadingContext";
import { Row, SearchBar, short } from "../components/ExplorerBits";

countries.registerLocale(enLocale);

// The 50m atlas rather than 110m: at 110m the small island and city states are
// omitted entirely, which silently dropped Singapore, Bahrain, Barbados,
// Bermuda, Seychelles and San Marino — all real passport issuers in the ICAO
// master list. Loaded on demand so its ~750KB stays out of the main bundle.
const loadAtlas = () => import("world-atlas/countries-50m.json").then((m) => m.default);

// ICAO master lists also carry codes that are not countries and can never be
// placed: EU (European Union), UN (laissez-passer), ZZ (unassigned).
const NON_COUNTRY = new Set(["EU", "UN", "ZZ"]);

// The chain records an ISO 3166-1 alpha-2 code (taken from the Document Signer's
// certificate); the world atlas keys its shapes by numeric ISO code. Names are
// deliberately not used to join the two — they differ between sources.
const numericOf = (alpha2) => countries.alpha2ToNumeric(alpha2) ?? null;
const nameOf = (alpha2) => countries.getName(alpha2, "en") ?? alpha2;

// Unregistered countries stay neutral; registered ones ramp through the app's
// green so relative volume is readable without a legend.
const shadeFor = (count, max) => {
  if (!count) return "#eef0f2";
  const t = max > 1 ? Math.log(count + 1) / Math.log(max + 1) : 1;
  const light = 88 - t * 48; // 88% (pale) -> 40% (deep)
  return `hsl(122, 45%, ${light}%)`;
};

/**
 * Registrations: how many humans have registered, and where their passports
 * are from. A registration names no account — it is a passport nullifier and
 * an identity-tree leaf. There is no lookup by passport nullifier: only the
 * passport's holder (or someone holding its data) knows one, and asking the
 * LCD for it would tie the asker's IP to that registration. The only lookup
 * is a Document Signer's count.
 */
const ExplorerRegistrations = () => {
  const { hideLoading } = useLoading();
  const [rows, setRows] = useState([]);
  const [tree, setTree] = useState(null);
  const [live, setLive] = useState(null);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [hover, setHover] = useState(null);
  const [atlas, setAtlas] = useState(null);

  useEffect(() => {
    loadAtlas().then(setAtlas).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    hideLoading();
    let cancelled = false;
    personhood
      .registrationCountries()
      .then((r) => !cancelled && setRows(r))
      .catch((err) => !cancelled && setError(err.message));
    personhood.identityTree().then((t) => !cancelled && setTree(t));
    personhood.registrationCount().then((c) => !cancelled && setLive(c));
    return () => {
      cancelled = true;
    };
  }, []);

  // Registrations whose certificate had no country still count toward the
  // total, but cannot be placed on the map.
  const byNumeric = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (!r.country || NON_COUNTRY.has(r.country)) continue;
      const n = numericOf(r.country);
      if (n) m.set(String(Number(n)), r);
    }
    return m;
  }, [rows]);

  const total = rows.reduce((s, r) => s + r.count, 0);
  // Registrations that cannot appear on the map: no country on the certificate,
  // or an issuer that is not a country. Counted, not hidden.
  const offMap = rows
    .filter((r) => !r.country || NON_COUNTRY.has(r.country))
    .reduce((s, r) => s + r.count, 0);
  const max = rows.reduce(
    (m, r) => (r.country && !NON_COUNTRY.has(r.country) ? Math.max(m, r.count) : m),
    0,
  );
  const placed = rows.filter((r) => r.country && !NON_COUNTRY.has(r.country));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Registrations</h2>
        <SearchBar onError={setSearchError} />
        {searchError && <div className={styles.searchError}>{searchError}</div>}
      </div>

      <Link className={styles.backLink} to="/explorer">
        ← Explorer
      </Link>

      {error && (
        <div className={styles.card}>
          <div className={styles.empty}>Could not load registrations: {error}</div>
        </div>
      )}

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Registered humans</span>
          <span className={styles.statValue}>{(live ?? total).toLocaleString()}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Identity tree leaves</span>
          <span className={styles.statValue}>{tree ? tree.size.toLocaleString() : "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Countries</span>
          <span className={styles.statValue}>{placed.length.toLocaleString()}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Not on map</span>
          <span className={styles.statValue}>{offMap.toLocaleString()}</span>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          Registrations by country
          {hover && (
            <span className={styles.muted}>
              {" — "}
              {hover.name}: {hover.count.toLocaleString()}
            </span>
          )}
        </h3>
        <div className={styles.mapWrap}>
          {!atlas && <div className={styles.empty}>Loading map…</div>}
          {atlas && (
          <ComposableMap
            projection="geoEqualEarth"
            projectionConfig={{ scale: 150 }}
            width={800}
            height={380}
            style={{ width: "100%", height: "auto" }}
          >
            <Geographies geography={atlas}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const row = byNumeric.get(String(Number(geo.id)));
                  const count = row?.count ?? 0;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={shadeFor(count, max)}
                      stroke="#fff"
                      strokeWidth={0.4}
                      onMouseEnter={() =>
                        setHover({ name: geo.properties.name, count })
                      }
                      onMouseLeave={() => setHover(null)}
                      style={{
                        default: { outline: "none" },
                        hover: { outline: "none", fill: count ? "#2e7d32" : "#e0e3e6" },
                        pressed: { outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
          )}
        </div>
      </div>

      <Lookups />

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Breakdown</h3>
        {rows.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Country</th>
                <th>Registrations</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.country || "unknown"}>
                  <td>
                    {r.country ? nameOf(r.country) : <span className={styles.muted}>Unknown</span>}
                    {r.country && <span className={styles.muted}> ({r.country})</span>}
                    {NON_COUNTRY.has(r.country) && (
                      <span className={styles.muted}> — not a country, not mapped</span>
                    )}
                  </td>
                  <td>{r.count.toLocaleString()}</td>
                  <td className={styles.muted}>
                    {total ? `${((r.count / total) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>
            {error ? "—" : "No registrations yet."}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Count a Document Signer's registrations. A signer key is a passport
 * office's certificate, not a person's.
 */
const Lookups = () => {
  const [dsc, setDsc] = useState("");
  const [dscCount, setDscCount] = useState(null);
  const [err, setErr] = useState("");

  const countDsc = async (e) => {
    e.preventDefault();
    setErr("");
    setDscCount(null);
    const c = await personhood.registrationsByDsc(dsc);
    if (c === null) setErr("Could not look that up. A signer key is hex.");
    else setDscCount({ key: dsc.trim(), count: c });
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Look up</h3>
      <form className={forms.formRow} onSubmit={countDsc}>
        <input
          className={`${forms.input} ${forms.field} ${styles.mono}`}
          placeholder="Document Signer key (hex)"
          value={dsc}
          onChange={(e) => setDsc(e.target.value)}
        />
        <button className={forms.button} type="submit">
          Count registrations
        </button>
      </form>
      {err && <div className={styles.searchError}>{err}</div>}
      {dscCount && (
        <Row label="Signer registrations">
          {dscCount.count.toLocaleString()}{" "}
          <span className={`${styles.muted} ${styles.mono}`}>{short(dscCount.key, 12, 6)}</span>
        </Row>
      )}
    </div>
  );
};

export default ExplorerRegistrations;
