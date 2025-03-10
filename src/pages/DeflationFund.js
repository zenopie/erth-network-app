import React from "react";
import "./DeflationFund.css";
import AllocationFund from "../components/AllocationFund";

const this_contract = "secret10ea3ya578qnz02rmr7adhu2rq7g2qjg88ry2h5";
const this_hash = "df9766e5327d6544c8110b7efce5d8a18ea43ad61d11877b888263e09811962b";

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
