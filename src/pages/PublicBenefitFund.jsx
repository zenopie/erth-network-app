import React from "react";
import styles from "./PublicBenefitFund.module.css";
import AllocationFund from "../components/AllocationFund";
import { STREAM_HUMAN } from "../chain/allocation";

// The Caretaker Fund is x/allocation's human stream: one registered human, one
// vote. (The Deflation Fund is the stake-weighted counterpart — same engine,
// separate options and totals.)
const PublicBenefitFund = () => {
  return (
    <div className={styles.container}>
      <AllocationFund title="Caretaker Fund" stream={STREAM_HUMAN} />
    </div>
  );
};

export default PublicBenefitFund;
