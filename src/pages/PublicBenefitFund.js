import React from "react";
import "./PublicBenefitFund.css";
import AllocationFund from "../components/AllocationFund";

const this_contract = "secret12q72eas34u8fyg68k6wnerk2nd6l5gaqppld6p";
const this_hash = "2c0d1e6fa1fdf4899384107a3a2f0b7424143f65ebc975fa802ffe0926db4606";

const allocationNames = [
  { id: "1", name: "Registration Rewards" },
  // Add more allocation names here
];

const PublicBenefitFund = ({ isKeplrConnected }) => {
  return (
    <div className="public-benefit-container">
      <AllocationFund
        title="Public Benefit Fund"
        contract={this_contract}
        contractHash={this_hash}
        allocationNames={allocationNames}
        isKeplrConnected={isKeplrConnected}
      />
    </div>
  );
};

export default PublicBenefitFund;
