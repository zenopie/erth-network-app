import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import styles from "../pages/Explorer.module.css";
import forms from "../pages/Forms.module.css";
import * as dex from "../chain/dex";
import { balance } from "../chain/bank";
import { MAX_FEE_UERTH, broadcast } from "../chain/tx";
import { UANML, UERTH } from "../chain/config";
import { decodeShieldedAddress } from "../chain/shieldedAddress";
import { SLIPPAGE_DEFAULT, clampSlippage, formatUnits, toBigInt, toMicro } from "../chain/tokens";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import StatusModal from "./StatusModal";
import ShieldedAddressInput from "./ShieldedAddressInput";
import AmountNote from "./AmountNote";

// What Max leaves for the fee: broadcast()'s default gas at Keplr's highest
// gas price, since Keplr may re-price the fee upward.
const FEE_HEADROOM = MAX_FEE_UERTH;

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
  // { micro, out (BigInt uanml), at } from dex.boundBuyAnmlQuote, or null.
  // Bound to the amount it was asked for: dex.buyAnmlFloor gives no floor
  // (and the button stays disabled) for any other amount or once it is older
  // than QUOTE_TTL_MS.
  const [quote, setQuote] = useState(null);
  const [now, setNow] = useState(() => Date.now());
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

  // Every amount edit drops the quote at once (before the next render), so a
  // slow or hung quote request can never leave an earlier amount's floor on
  // screen or in the signed message.
  const changeAmount = (v) => {
    seq.current += 1;
    setQuote(null);
    setAmount(v);
  };

  useEffect(() => {
    const id = ++seq.current;
    setQuote(null);
    if (micro === "0") return undefined;
    const ask = () =>
      dex
        .boundBuyAnmlQuote(micro)
        .then((q) => id === seq.current && setQuote(q))
        .catch(() => id === seq.current && setQuote(null));
    ask();
    // Re-ask before the quote ages out, and tick `now` so an expired quote
    // disables the button even when no answer comes back.
    const t = setInterval(() => {
      setNow(Date.now());
      ask();
    }, dex.QUOTE_TTL_MS / 2);
    return () => clearInterval(t);
  }, [micro]);

  const minOut = dex.buyAnmlFloor(quote, micro, slippage, Math.max(now, quote?.at ?? 0));
  const shown = quote && quote.micro === micro ? quote.out : null;

  let problem = "";
  if (!isConnected) problem = "Connect Keplr to buy.";
  else if (!recipient.trim()) problem = "Enter the recipient's shielded address.";
  else {
    try {
      decodeShieldedAddress(recipient);
      if (micro === "0") problem = "Enter an amount of ERTH.";
      else if (!quote || quote.micro !== micro) problem = "Getting a price for this amount…";
      else if (minOut === "0") problem = "No current ANML pool price for this amount.";
      else if (bal !== null && BigInt(micro) + FEE_HEADROOM > toBigInt(bal)) {
        problem = "Not enough ERTH for this amount plus the fee.";
      }
    } catch (e) {
      problem = e.message;
    }
  }

  const max = () => {
    if (bal === null) return;
    const m = toBigInt(bal) - FEE_HEADROOM;
    changeAmount(m > 0n ? formatUnits(m.toString(), UERTH) : "0");
  };

  const submit = (e) => {
    e.preventDefault();
    if (problem) return;
    // What was shown is what is signed: the amount and the floor read at the
    // same render, the floor non-zero only for a fresh quote of this amount.
    const signedMicro = micro;
    const signedMin = dex.buyAnmlFloor(quote, signedMicro, slippage);
    if (signedMin === "0") return;
    execute(async () => {
      // Fresh note secrets per attempt (buyAnmlTo draws them).
      const tx = await broadcast([dex.buyAnmlTo(address, recipient, signedMicro, signedMin)]);
      setDone({ hash: tx.txhash, erth: formatUnits(signedMicro, UERTH) });
      changeAmount("");
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
            onChange={(e) => changeAmount(e.target.value)}
          />
          <AmountNote value={amount} denom={UERTH} />
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

        {shown !== null && shown > 0n && minOut !== "0" && (
          <div className={forms.note}>
            About {formatUnits(shown.toString(), UANML)} ANML · at least{" "}
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
