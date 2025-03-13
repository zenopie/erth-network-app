import React from "react";
import "./DeflationFund.css";
import AllocationFund from "../components/AllocationFund";

const this_contract = "secret10ea3ya578qnz02rmr7adhu2rq7g2qjg88ry2h5";
const this_hash = "1927483d3ffff57a3a6ccf37644277cdc68499c1d3a1d7fbb9211e4dc545ec4c";

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
