import React from "react";
import styles from "./PublicBenefitFund.module.css";
import AllocationFund from "../components/AllocationFund";
import contracts from "../utils/contracts";

const PublicBenefitFund = () => {
  return (
    <div className={styles.container}>
      <AllocationFund
        title="Caretaker Fund"
        contract={contracts.registration?.contract}
        contractHash={contracts.registration?.hash}
      />
    </div>
  );
};

export default PublicBenefitFund;
