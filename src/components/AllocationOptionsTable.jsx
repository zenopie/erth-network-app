import React from "react";
import { Link } from "react-router-dom";
import styles from "../pages/Explorer.module.css";
import forms from "../pages/Forms.module.css";
import { UERTH } from "../chain/config";
import { formatMacro, percentString, sumBig, toBigInt } from "../chain/tokens";
import { short } from "./ExplorerBits";

const KIND = {
  ALLOCATION_KIND_INTEGRATED: "Integrated",
  ALLOCATION_KIND_ADDRESS: "Address",
};

/**
 * One stream's options: what each is, the share of the stream's weight it
 * holds, and the ERTH it has accrued. An ADDRESS option's payout is triggered
 * by anyone (or only its claimer, when one is set) and always goes to its
 * recipient — a transparent act, so it is offered here via Keplr.
 */
const AllocationOptionsTable = ({ options, address, onClaim, totalWeight, partial = false }) => {
  if (options === null) return <div className={styles.empty}>Could not load options.</div>;
  if (!options.length) return <div className={styles.empty}>No options yet.</div>;

  // Option weights are integer strings past 2^53 (Groundworks: rate x derth).
  // Shares are of the chain's stream total (every live option), not of the
  // options loaded, which may be a partial list (audit 6 L-6).
  const loaded = sumBig(options.filter((o) => !o.removed).map((o) => o.amountAllocated));
  const total = toBigInt(totalWeight) > loaded ? toBigInt(totalWeight) : loaded;
  const canClaim = (o) =>
    address &&
    onClaim &&
    !o.removed &&
    o.kind === "ALLOCATION_KIND_ADDRESS" &&
    toBigInt(o.accumulated) > 0n &&
    (!o.claimer || o.claimer === address);

  return (
    <>
    {partial && (
      <div className={styles.muted}>
        Partial list: not every option could be read from the chain. Shares are of the whole stream.
      </div>
    )}
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Option</th>
          <th>Kind</th>
          <th>Share</th>
          <th>Accrued</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {options.map((o) => (
          <tr key={o.id}>
            <td>
              #{o.id} {o.description || <span className={styles.muted}>Unnamed</span>}
              {o.removed && <span className={styles.badge}>Removed</span>}
              {o.recipient && (
                <div className={styles.muted}>
                  →{" "}
                  <Link className={`${styles.link} ${styles.mono}`} to={`/explorer/account/${o.recipient}`}>
                    {short(o.recipient, 12, 6)}
                  </Link>
                </div>
              )}
              {o.handler && <div className={styles.muted}>handler: {o.handler}</div>}
            </td>
            <td>{KIND[o.kind] ?? o.kind}</td>
            <td>
              {total > 0n && !o.removed ? `${percentString(o.amountAllocated, total)}%` : "—"}
            </td>
            <td>{formatMacro(o.accumulated, UERTH)} ERTH</td>
            <td>
              {canClaim(o) && (
                <button className={forms.ghostButton} onClick={() => onClaim(o)}>
                  Pay out
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
};

export default AllocationOptionsTable;
