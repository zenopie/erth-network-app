import React from "react";
import styles from "./CaretakerFund.module.css";
import AllocationFund from "../components/AllocationFund";
import { STREAM_CARETAKER } from "../chain/allocation";

// The Caretaker Fund is x/allocation's human stream: one registered human, one
// vote. (The Groundworks Fund is the stake-weighted counterpart — same engine,
// separate options and totals.)
const CaretakerFund = () => {
  return (
    <div className={styles.container}>
      <AllocationFund title="Caretaker Fund" stream={STREAM_CARETAKER} />
    </div>
  );
};

export default CaretakerFund;
