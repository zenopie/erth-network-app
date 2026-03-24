import React from "react";
import styles from "./DeflationFund.module.css";
import AllocationFund from "../components/AllocationFund";
import contracts from "../utils/contracts";

// Using the staking contract from contracts.js utility
const this_contract = contracts.staking.contract;
const this_hash = contracts.staking.hash;

const allocationNames = [
  { id: "1", name: "LP Rewards" },
  { id: "2", name: "SCRT Labs" },
  { id: "3", name: "ERTH Labs" },
  { id: "4", name: "Airdrop" },
  // Add more allocation names here
];

const DeflationFund = () => {
  return (
    <div className={styles.container}>
      <AllocationFund
        title="Deflation Fund"
        contract={this_contract}
        contractHash={this_hash}
        allocationNames={allocationNames}
      />
    </div>
  );
};

export default DeflationFund;
