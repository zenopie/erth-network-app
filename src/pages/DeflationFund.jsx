import React from "react";
import styles from "./DeflationFund.module.css";
import AllocationFund from "../components/AllocationFund";
import { STREAM_CAPITAL } from "../chain/allocation";

// The Deflation Fund is x/allocation's capital stream: your vote carries your
// bonded stake. (The Caretaker Fund is the one-human-one-vote counterpart —
// same engine, separate options and totals.)
const DeflationFund = () => {
  return (
    <div className={styles.container}>
      <AllocationFund title="Deflation Fund" stream={STREAM_CAPITAL} />
    </div>
  );
};

export default DeflationFund;
