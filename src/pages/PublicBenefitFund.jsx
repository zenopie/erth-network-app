import React from "react";
import styles from "./PublicBenefitFund.module.css";
import AllocationFund from "../components/AllocationFund";
import contracts from "../utils/contracts";

// Using the registration contract from contracts.js utility
const this_contract = contracts.registration.contract;
const this_hash = contracts.registration.hash;

const allocationNames = [
  { id: "1", name: "Registration Rewards" },
  // Add more allocation names here
];

const PublicBenefitFund = () => {
  return (
    <div className={styles.container}>
      <AllocationFund
        title="Caretaker Fund"
        contract={this_contract}
        contractHash={this_hash}
        allocationNames={allocationNames}
      />
    </div>
  );
};

export default PublicBenefitFund;
