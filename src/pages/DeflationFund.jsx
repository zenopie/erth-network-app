import React from "react";
import styles from "./DeflationFund.module.css";
import AllocationFund from "../components/AllocationFund";
import contracts from "../utils/contracts";

const allocationNames = [
  { id: "1", name: "LP Rewards" },
  { id: "2", name: "SCRT Labs" },
  { id: "3", name: "ERTH Labs" },
  { id: "4", name: "Airdrop" },
];

const DeflationFund = () => {
  return (
    <div className={styles.container}>
      <AllocationFund
        title="Deflation Fund"
        contract={contracts.staking?.contract}
        contractHash={contracts.staking?.hash}
        allocationNames={allocationNames}
      />
    </div>
  );
};

export default DeflationFund;
