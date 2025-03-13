import React from "react";
import "./DeflationFund.css";
import AllocationFund from "../components/AllocationFund";
import contracts from "../utils/contracts";

// Using the staking contract from contracts.js utility
const this_contract = contracts.staking.contract;
const this_hash = contracts.staking.hash;

const allocationNames = [
  { id: "1", name: "LP Rewards" },
  // Add more allocation names here
];

const DeflationFund = ({ isKeplrConnected }) => {
  return (
    <div className="deflation-fund-container">
      <AllocationFund
        title="Deflation Fund"
        contract={this_contract}
        contractHash={this_hash}
        allocationNames={allocationNames}
        isKeplrConnected={isKeplrConnected}
      />
    </div>
  );
};

export default DeflationFund;
