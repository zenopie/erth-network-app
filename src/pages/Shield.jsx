import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Explorer.module.css";
import forms from "./Forms.module.css";
import { balance } from "../chain/bank";
import { checkShield, shieldTo } from "../chain/shielded";
import { broadcast } from "../chain/tx";
import { UERTH } from "../chain/config";
import { formatUnits, toMicro } from "../chain/tokens";
import { memoBytes } from "../chain/noteCipher";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import StatusModal from "../components/StatusModal";
import MobileCta from "../components/MobileCta";
import ShieldedAddressInput from "../components/ShieldedAddressInput";

// broadcast()'s default gas (400k) at 0.025 uerth: what Max leaves for the fee.
const FEE_HEADROOM = 10_000n;

/**
 * Shield ERTH: transparent ERTH from the connected Keplr account into a
 * private note owned by a shielded (erthz1…) address — MsgShield.
 *
 * The amount and the sending account are public; who receives the note is
 * not. The note is encrypted to the address, so the Earth Wallet app that
 * owns it finds it on its next sync. The web app holds no shielded keys: it
 * can pay into the private layer but never see or spend from it.
 */
const Shield = () => {
  const { hideLoading } = useLoading();
  const { address, isConnected } = useWallet();
  const { isModalOpen, animationState, error: txError, execute, closeModal } = useTransaction();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [bal, setBal] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    hideLoading();
  }, [hideLoading]);

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

  const micro = toMicro(amount, UERTH);
  let memoLen = 0;
  let memoOk = true;
  try {
    memoLen = new TextEncoder().encode(memo).length;
    memoBytes(memo);
  } catch {
    memoOk = false;
  }

  // Validate exactly as the msg will be built, so the button and the msg agree.
  let problem = "";
  if (!isConnected) problem = "Connect Keplr to shield.";
  else {
    try {
      checkShield(recipient, micro, memo);
    } catch (e) {
      problem = recipient.trim() ? e.message : "Enter the recipient's shielded address.";
    }
    if (!problem && bal !== null && BigInt(micro) + FEE_HEADROOM > BigInt(bal)) {
      problem = "Not enough ERTH for this amount plus the fee.";
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
      // Fresh rho, rcm and ephemeral key for every attempt: a retry never
      // reuses the note secrets of one that may already have landed.
      const { msg, cm } = shieldTo(address, recipient, micro, { memo });
      const tx = await broadcast([msg]);
      setDone({ hash: tx.txhash, cm, amount: formatUnits(micro, UERTH) });
      setAmount("");
      setMemo("");
      refresh();
    });
  };

  return (
    <div className={styles.page}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} />
      <div className={styles.header}>
        <h2 className={styles.title}>Shield ERTH</h2>
      </div>

      <MobileCta title="The recipient needs the Earth Wallet app">
        Shielded ERTH lives in the app, not in Keplr. In the app, open Receive and copy (or show
        the QR of) the <strong>shielded address</strong>: it starts with <code>erthz1</code> and is
        116 characters. It can be your own or someone else&apos;s. An <code>earth1…</code> address
        will not work.
      </MobileCta>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Send transparent ERTH into a private note</h3>
        <p className={forms.note}>
          Everyone can see that this account shielded this amount. Nobody can see who received
          it: the note names its owner only through a one-time commitment, and its details are
          encrypted so that only the recipient&apos;s app can read them. It shows up there after
          the app&apos;s next sync.
        </p>
        <form onSubmit={submit}>
          <ShieldedAddressInput value={recipient} onChange={setRecipient} />

          <label className={forms.label} htmlFor="shield-amount">
            Amount (ERTH)
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
              id="shield-amount"
              className={`${forms.input} ${forms.field}`}
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <label className={forms.label} htmlFor="shield-memo">
            Memo (optional, encrypted: only the recipient can read it) · {memoLen}/64 bytes
          </label>
          <div className={forms.formRow}>
            <input
              id="shield-memo"
              className={`${forms.input} ${forms.field}`}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
          {!memoOk && <div className={forms.warn}>The memo is limited to 64 bytes.</div>}

          {problem && recipient.trim() && amount && <div className={forms.warn}>{problem}</div>}
          <button className={forms.button} type="submit" disabled={Boolean(problem)}>
            {isConnected ? "Shield" : "Connect Keplr to shield"}
          </button>
        </form>

        {done && (
          <div className={styles.kv} style={{ marginTop: 12 }}>
            <div className={styles.kvLabel}>Shielded {done.amount} ERTH</div>
            <div className={styles.kvValue}>
              <Link className={styles.link} to={`/explorer/tx/${done.hash}`}>
                {done.hash.slice(0, 16)}…
              </Link>
              <div className={styles.muted}>
                Note commitment <span className={styles.mono}>{done.cm.slice(0, 16)}…</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Also paid to a shielded address</h3>
        <p className={forms.note}>
          <Link className={styles.link} to="/anml">Buy ANML</Link> with ERTH, and withdraw from the
          ANML pool on <Link className={styles.link} to="/markets">Markets</Link>: the ANML arrives as
          a note at an <code>erthz1…</code> address the same way.
        </p>
      </div>
    </div>
  );
};

export default Shield;
