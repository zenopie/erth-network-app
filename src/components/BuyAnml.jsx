import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import styles from "../pages/Explorer.module.css";
import forms from "../pages/Forms.module.css";
import * as dex from "../chain/dex";
import { balance } from "../chain/bank";
import { broadcast } from "../chain/tx";
import { UANML, UERTH } from "../chain/config";
import { decodeShieldedAddress } from "../chain/shieldedAddress";
import { SLIPPAGE_DEFAULT, clampSlippage, formatUnits, minimumReceived, toMicro } from "../chain/tokens";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import StatusModal from "./StatusModal";
import ShieldedAddressInput from "./ShieldedAddressInput";

// broadcast()'s default gas (400k) at 0.025 uerth: what Max leaves for the fee.
const FEE_HEADROOM = 10_000n;

/**
 * Buy ANML with ERTH from Keplr: MsgBuyAnml swaps transparent ERTH through
 * the ANML pool and mints the ANML as a note to a shielded address. The
 * amount bought is set by the pool when the tx runs (at least the minimum),
 * so the note carries the value-blind ciphertext and the recipient's app
 * reads the amount from the chain.
 */
const BuyAnml = () => {
  const { address, isConnected } = useWallet();
  const { isModalOpen, animationState, error: txError, txHash, execute, closeModal } = useTransaction();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(SLIPPAGE_DEFAULT);
  const [quote, setQuote] = useState(null); // BigInt uanml, or null
  const [bal, setBal] = useState(null);
  const [done, setDone] = useState(null);
  const seq = useRef(0);

  const micro = toMicro(amount, UERTH);

  const refresh = useCallback(() => {
    if (!address) {
      setBal(null);
      return;
    }
    balance(address, UERTH).then(setBal).catch(() => setBal(null));
  }, [address]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = ++seq.current;
    if (micro === "0") {
      setQuote(null);
      return;
    }
    dex
      .quoteBuyAnml(micro)
      .then((q) => id === seq.current && setQuote(q))
      .catch(() => id === seq.current && setQuote(null));
  }, [micro]);

  const minOut = quote ? minimumReceived(quote.toString(), slippage) : "0";

  let problem = "";
  if (!isConnected) problem = "Connect Keplr to buy.";
  else if (!recipient.trim()) problem = "Enter the recipient's shielded address.";
  else {
    try {
      decodeShieldedAddress(recipient);
      if (micro === "0") problem = "Enter an amount of ERTH.";
      else if (!quote || minOut === "0") problem = "No ANML pool price for this amount.";
      else if (bal !== null && BigInt(micro) + FEE_HEADROOM > BigInt(bal)) {
        problem = "Not enough ERTH for this amount plus the fee.";
      }
    } catch (e) {
      problem = e.message;
    }
  }

  const max = () => {
    if (bal === null) return;
    const m = BigInt(bal) - FEE_HEADROOM;
    setAmount(m > 0n ? formatUnits(m.toString(), UERTH) : "0");
  };

  const submit = (e) => {
    e.preventDefault();
    if (problem) return;
    execute(async () => {
      // Fresh note secrets per attempt (buyAnmlTo draws them).
      const tx = await broadcast([dex.buyAnmlTo(address, recipient, micro, minOut)]);
      setDone({ hash: tx.txhash, erth: formatUnits(micro, UERTH) });
      setAmount("");
      refresh();
    });
  };

  return (
    <div className={styles.card}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} txHash={txHash} />
      <h3 className={styles.cardTitle}>Buy ANML with ERTH</h3>
      <p className={forms.note}>
        Pay transparent ERTH from Keplr; the ANML arrives as a private note at a shielded address
        from the Earth Wallet app (Receive → shielded address, <code>erthz1…</code>), yours or
        someone else&apos;s. ANML cannot be held in Keplr. The ERTH spent and the ANML bought are
        public; who received it is not.
      </p>
      <form onSubmit={submit}>
        <ShieldedAddressInput value={recipient} onChange={setRecipient} />

        <label className={forms.label} htmlFor="buy-anml-amount">
          Pay (ERTH)
          {bal !== null && (
            <>
              {" "}· balance {formatUnits(bal, UERTH)}{" "}
              <button type="button" className={forms.ghostButton} onClick={max}>
                Max
              </button>
            </>
          )}
        </label>
        <div className={forms.formRow}>
          <input
            id="buy-anml-amount"
            className={`${forms.input} ${forms.field}`}
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <label className={forms.label} style={{ margin: 0 }}>
            Slippage %{" "}
            <input
              className={forms.input}
              style={{ width: 70 }}
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              onBlur={() => setSlippage(clampSlippage(slippage))}
            />
          </label>
        </div>

        {quote !== null && quote > 0n && (
          <div className={forms.note}>
            About {formatUnits(quote.toString(), UANML)} ANML · at least{" "}
            {formatUnits(minOut, UANML)} ANML or the purchase is refused and nothing is spent.
          </div>
        )}
        {problem && (recipient.trim() || amount) && <div className={forms.warn}>{problem}</div>}
        <button className={forms.button} type="submit" disabled={Boolean(problem)}>
          {isConnected ? "Buy ANML" : "Connect Keplr to buy"}
        </button>
      </form>
      {done && (
        <div className={styles.kv} style={{ marginTop: 12 }}>
          <div className={styles.kvLabel}>Bought ANML for {done.erth} ERTH</div>
          <div className={styles.kvValue}>
            <Link className={styles.link} to={`/explorer/tx/${done.hash}`}>
              {done.hash.slice(0, 16)}…
            </Link>
            <div className={styles.muted}>The note appears in the recipient&apos;s app after its next sync.</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuyAnml;
