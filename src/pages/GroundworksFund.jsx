import React from "react";
import styles from "./GroundworksFund.module.css";
import AllocationFund from "../components/AllocationFund";
import { STREAM_GROUNDWORKS } from "../chain/allocation";

// The Groundworks Fund is x/allocation's capital stream: your vote carries your
// bonded stake. (The Caretaker Fund is the one-human-one-vote counterpart —
// same engine, separate options and totals.)
const GroundworksFund = () => {
  return (
    <div className={styles.container}>
      <AllocationFund title="Groundworks Fund" stream={STREAM_GROUNDWORKS} />
    </div>
  );
};

export default GroundworksFund;
