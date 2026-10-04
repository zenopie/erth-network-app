import React from "react";
import forms from "../pages/Forms.module.css";
import { amountNote } from "../chain/tokens";

/**
 * Says why a typed amount cannot be used (more decimals than its denom has)
 * instead of dropping digits silently. Nothing when it is fine.
 */
const AmountNote = ({ value, denom }) => {
  const note = amountNote(value, denom);
  return note ? (
    <div className={forms.warn} role="alert">
      {note}
    </div>
  ) : null;
};

export default AmountNote;
