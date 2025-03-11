import React from "react";
import "./DeflationFund.css";
import AllocationFund from "../components/AllocationFund";

const this_contract = "secret10ea3ya578qnz02rmr7adhu2rq7g2qjg88ry2h5";
const this_hash = "e1d50842f1bdce13c978686073d8cf75df0737621c05b875c0c07387ee9516da";

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
