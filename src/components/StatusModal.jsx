import React, { useEffect, useRef } from "react";
import styles from "./StatusModal.module.css";

const StatusModal = ({ isOpen, onClose, animationState }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (animationState === "success" || animationState === "error") {
      const timer = setTimeout(() => onCloseRef.current(), 1500);
      return () => clearTimeout(timer);
    }
  }, [animationState]);

  if (!isOpen) return null;

  const isSuccess = animationState === "success";
  const isError = animationState === "error";

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
      </div>
    </>
  );
};

export default StatusModal;
