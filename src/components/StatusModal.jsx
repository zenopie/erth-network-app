import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import styles from "./StatusModal.module.css";

const StatusModal = ({ isOpen, onClose, animationState, error, txHash }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Success closes itself. An error stays until dismissed, so its reason can
  // be read.
  useEffect(() => {
    if (animationState === "success") {
      const timer = setTimeout(() => onCloseRef.current(), 1500);
      return () => clearTimeout(timer);
    }
  }, [animationState]);

  if (!isOpen) return null;

  const isSuccess = animationState === "success";
  const isError = animationState === "error";
  // Sent, outcome unread: not a failure, and not to be retried until the hash
  // resolves (broadcast() refuses another tx from the account until then).
  const isUnknown = animationState === "unknown";

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.modal}>
        {/* Orbit */}
        <div className={styles.orbit}>
          <div className={styles.track} />
          <img src="/images/coin/ERTH.png" alt="" className={styles.erth} />
          <div className={styles.path}>
            <img src="/images/coin/ANML.png" alt="" className={styles.anml} />
          </div>
        </div>

        {/* Result */}
        <div className={styles.result}>
          {isSuccess && <div className={styles.successIcon} />}
          {isError && <div className={styles.errorIcon} />}
        </div>
        {isUnknown && (
          <p className={styles.errorMessage} role="status">
            Submitted, status unknown.{" "}
            {txHash && (
              <>
                Check{" "}
                <Link to={`/explorer/tx/${encodeURIComponent(txHash)}`} onClick={onClose}>
                  {txHash.slice(0, 16)}…
                </Link>{" "}
              </>
            )}
            before trying again: it may still land.
          </p>
        )}
        {isError && error && (
          <p className={styles.errorMessage} role="alert">
            {error.length > 400 ? error.slice(0, 400) + "…" : error}
          </p>
        )}
      </div>
    </>
  );
};

export default StatusModal;
