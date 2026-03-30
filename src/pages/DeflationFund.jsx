import React from "react";
import styles from "./DeflationFund.module.css";
import AllocationFund from "../components/AllocationFund";
import contracts from "../utils/contracts";

const DeflationFund = () => {
  return (
    <div className={styles.container}>
      <AllocationFund
        title="Deflation Fund"
        contract={contracts.staking?.contract}
        contractHash={contracts.staking?.hash}
      />
    </div>
  );
};

export default DeflationFund;
