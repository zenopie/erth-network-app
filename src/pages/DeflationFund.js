import React from "react";
import "./DeflationFund.css";
import AllocationFund from "../components/AllocationFund";

const this_contract = "secret10ea3ya578qnz02rmr7adhu2rq7g2qjg88ry2h5";
const this_hash = "fd4e5f3c57244f50845f15dc92ef6a11127d4fedf1fd338a47127f799e12e723";

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
