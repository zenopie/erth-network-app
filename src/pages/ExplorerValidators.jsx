import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Explorer.module.css";
import * as explorer from "../chain/explorer";
import { UERTH } from "../chain/config";
import { toMacro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { Row, SearchBar, short } from "../components/ExplorerBits";

/** Uptime colouring: green when comfortable, amber when drifting, red when at risk. */
const uptimeClass = (uptime, minSigned) => {
  if (uptime === null) return styles.muted;
  const floor = minSigned * 100;
  if (uptime >= 99) return styles.uptimeGood;
  if (uptime >= floor + (100 - floor) / 2) return styles.uptimeWarn;
  return styles.uptimeBad;
};

const StatusPill = ({ v }) => {
  if (v.tombstoned)
    return <span className={`${styles.badge} ${styles.badgeFailed}`}>Tombstoned</span>;
  if (v.jailed) return <span className={`${styles.badge} ${styles.badgeFailed}`}>Jailed</span>;
  if (v.bonded) return <span className={`${styles.badge} ${styles.badgeSuccess}`}>Active</span>;
  return <span className={styles.badge}>Inactive</span>;
};

/** Validator set with stake, commission and slashing-window uptime. */
const ExplorerValidators = () => {
  const { hideLoading } = useLoading();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    hideLoading();
    let cancelled = false;
    explorer
      .validators()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const validators = data?.validators ?? [];
  const params = data?.params;
  const activeCount = validators.filter((v) => v.bonded).length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Validators</h2>
        <SearchBar onError={setSearchError} />
        {searchError && <div className={styles.searchError}>{searchError}</div>}
      </div>

      <Link className={styles.backLink} to="/explorer">
        ← Explorer
      </Link>

      {error && (
        <div className={styles.card}>
          <div className={styles.empty}>Could not load validators: {error}</div>
        </div>
      )}

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Active</span>
          <span className={styles.statValue}>
            {data ? `${activeCount} / ${validators.length}` : "—"}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Bonded</span>
          <span className={styles.statValue}>
            {data ? `${Math.round(toMacro(data.totalBonded, UERTH)).toLocaleString()}` : "—"}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Uptime window</span>
          <span className={styles.statValue}>
            {params ? `${params.signedBlocksWindow.toLocaleString()}` : "—"}
          </span>
        </div>
      </div>

      {params && (
        <div className={styles.card}>
          {/* Uptime below this floor over the window gets a validator jailed. */}
          <div className={styles.muted} style={{ fontSize: 13 }}>
            A validator must sign at least{" "}
            <strong>{(params.minSignedPerWindow * 100).toFixed(0)}%</strong> of the last{" "}
            <strong>{params.signedBlocksWindow.toLocaleString()}</strong> blocks or it is jailed for{" "}
            {params.downtimeJailDuration} and slashed{" "}
            {(params.slashFractionDowntime * 100).toFixed(2)}%. Double-signing is slashed{" "}
            {(params.slashFractionDoubleSign * 100).toFixed(2)}% and tombstoned permanently.
          </div>
        </div>
      )}

      <div className={styles.card}>
        {validators.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Validator</th>
                <th>Voting power</th>
                <th>Uptime</th>
                <th>Comm.</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {validators.map((v, i) => (
                <React.Fragment key={v.operator}>
                  <tr
                    onClick={() => setExpanded(expanded === v.operator ? null : v.operator)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className={styles.muted}>{i + 1}</td>
                    <td>
                      <span className={styles.link}>{v.moniker || short(v.operator)}</span>
                    </td>
                    <td>
                      {Math.round(toMacro(v.tokens, UERTH)).toLocaleString()}
                      <span className={styles.muted}> ({v.votingPower.toFixed(1)}%)</span>
                    </td>
                    <td
                      className={uptimeClass(v.uptime, params?.minSignedPerWindow ?? 0)}
                      title={
                        v.uptime === null
                          ? "No meaningful uptime: the signing window restarts when a validator is jailed"
                          : undefined
                      }
                    >
                      {v.uptime === null ? "—" : `${v.uptime.toFixed(2)}%`}
                    </td>
                    <td>{(v.commission * 100).toFixed(1)}%</td>
                    <td>
                      <StatusPill v={v} />
                    </td>
                  </tr>
                  {expanded === v.operator && (
                    <tr>
                      <td colSpan={6} style={{ background: "#f9fafb" }}>
                        <Row label="Operator">
                          <span className={styles.mono}>{v.operator}</span>
                        </Row>
                        <Row label="Consensus addr">
                          <span className={styles.mono}>{v.consAddress}</span>
                        </Row>
                        <Row label="Missed blocks">
                          {v.missedBlocks === null
                            ? "no signing record yet"
                            : `${v.missedBlocks.toLocaleString()} of the last ${params.signedBlocksWindow.toLocaleString()}`}
                          {(v.jailed || v.tombstoned) && (
                            <span className={styles.muted}>
                              {" "}
                              — counter reset when jailed; it restarts on unjail
                            </span>
                          )}
                        </Row>
                        <Row label="Commission">
                          {(v.commission * 100).toFixed(2)}% (max{" "}
                          {(v.maxCommission * 100).toFixed(2)}%)
                        </Row>
                        {v.jailed && v.jailedUntil && (
                          <Row label="Jailed until">
                            {new Date(v.jailedUntil).toLocaleString()}
                          </Row>
                        )}
                        {v.website && <Row label="Website">{v.website}</Row>}
                        {v.details && <Row label="Details">{v.details}</Row>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>{error ? "—" : "Loading validators…"}</div>
        )}
      </div>
    </div>
  );
};

export default ExplorerValidators;
