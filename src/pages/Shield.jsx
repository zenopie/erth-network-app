import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "./Explorer.module.css";
import forms from "./Forms.module.css";
import { balance, sendEnabled } from "../chain/bank";
import { checkShield, shieldTo } from "../chain/shielded";
import { broadcast } from "../chain/tx";
import { UERTH } from "../chain/config";
import { formatUnits, toBigInt, toMicro } from "../chain/tokens";
import { memoBytes } from "../chain/noteCipher";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import StatusModal from "../components/StatusModal";
import MobileCta from "../components/MobileCta";
import ShieldedAddressInput from "../components/ShieldedAddressInput";
import { addressProblem, handleDirectory, looksLikeHandle, parseHandle, truncateAddress } from "../chain/handles";

// broadcast()'s default gas (400k) at 0.025 uerth: what Max leaves for the fee.
const FEE_HEADROOM = 10_000n;

/**
 * Shield ERTH: transparent ERTH from the connected Keplr account into a
 * private note owned by a shielded (erthz1…) address — MsgShield. The
 * recipient may also be a handle ("@alice"): it is looked up in the whole
 * handle directory (never on its own), checked live against the chain's own
 * directory again just before signing, and the note goes to the address it
 * names.
 *
 * The amount and the sending account are public; who receives the note is
 * not. The note is encrypted to the address, so the Earth Wallet app that
 * owns it finds it on its next sync. The web app holds no shielded keys: it
 * can pay into the private layer but never see or spend from it.
 */
const Shield = () => {
  const { hideLoading } = useLoading();
  const { address, isConnected } = useWallet();
  const { isModalOpen, animationState, error: txError, txHash, execute, closeModal } = useTransaction();

  const { hash } = useLocation();
  // The handle directory's Pay button lands here with #to=@handle: in the
  // fragment, never the query, so the handle being paid is in no request
  // line and no Referer (Cloudflare and the origin never see it).
  const [recipient, setRecipient] = useState(() => {
    let to = "";
    try {
      to = new URLSearchParams(hash.replace(/^#/, "")).get("to") ?? "";
    } catch {
      /* not ours */
    }
    return looksLikeHandle(to) && parseHandle(to) ? `@${parseHandle(to)}` : "";
  });
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [bal, setBal] = useState(null);
  const [done, setDone] = useState(null);
  // A handle recipient: what the directory says it names (preview), and the
  // reviewed target the signature is for ({ handle, address }).
  const [handleInfo, setHandleInfo] = useState(null);
  const [storedReview, setReview] = useState(null);
  const recipientRef = useRef(recipient);
  recipientRef.current = recipient;
  const toHandle = looksLikeHandle(recipient);
  const review = toHandle && storedReview?.for === recipient ? storedReview : null;

  useEffect(() => {
    setReview(null);
    setHandleInfo(null);
    if (!toHandle) return undefined;
    if (!parseHandle(recipient)) {
      setHandleInfo({ ok: false, text: "A handle is 3-32 of a-z, 0-9 and -, no dash at either end." });
      return undefined;
    }
    let live = true;
    setHandleInfo({ ok: true, pending: true, text: "Looking up the handle directory…" });
    const t = setTimeout(async () => {
      try {
        const e = await handleDirectory.lookup(parseHandle(recipient));
        if (!live) return;
        const now = Math.floor(Date.now() / 1000);
        if (!e) setHandleInfo({ ok: false, text: `@${parseHandle(recipient)} is not claimed by anyone.` });
        else if (e.status !== "live" || now >= e.expiresAt) setHandleInfo({ ok: false, text: `@${e.handle} has lapsed and names no address now.` });
        else if (addressProblem(e.address)) setHandleInfo({ ok: false, text: `@${e.handle} names an address that cannot be paid.` });
        // Only the directory's word until Review checks it against the chain's own.
        else setHandleInfo({ ok: true, text: `@${e.handle} · ${truncateAddress(e.address)} (unverified until Review)` });
      } catch (err) {
        if (live) setHandleInfo({ ok: false, text: `Couldn't read the handle directory: ${err.message}` });
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [recipient, toHandle]);

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
    if (toHandle) {
      if (!handleInfo || handleInfo.pending) problem = "Looking up the handle…";
      else if (!handleInfo.ok) problem = handleInfo.text;
      else if (!/^\d+$/.test(micro) || BigInt(micro) <= 0n) problem = "Enter a positive amount.";
      else if (!memoOk) problem = "The memo is limited to 64 bytes.";
    } else {
      try {
        checkShield(recipient, micro, memo);
      } catch (e) {
        problem = recipient.trim() ? e.message : "Enter the recipient's shielded address or @handle.";
      }
    }
    if (!problem && bal !== null && BigInt(micro) + FEE_HEADROOM > toBigInt(bal)) {
      problem = "Not enough ERTH for this amount plus the fee.";
    }
  }

  const max = () => {
    if (bal === null) return;
    const m = toBigInt(bal) - FEE_HEADROOM;
    setAmount(m > 0n ? formatUnits(m.toString(), UERTH) : "0");
  };

  // A handle is reviewed first: the directory read fresh and checked against
  // the chain's own, the handle and the address it names shown, then signed.
  // A review is for the recipient it was asked for: one still resolving when
  // the field changes is dropped, and a stored one counts only while the
  // field still holds that recipient.
  const reviewHandle = async () => {
    const asked = recipient;
    setReview(null);
    let r;
    try {
      r = await handleDirectory.resolveForPayment(asked);
    } catch (err) {
      r = { ok: false, reason: `Couldn't read the handle directory: ${err.message}` };
    }
    if (recipientRef.current !== asked) return;
    if (!r.ok) {
      setHandleInfo({ ok: false, text: r.reason });
      return;
    }
    setReview({ for: asked, handle: r.entry.handle, address: r.entry.address });
  };

  const submit = (e) => {
    e.preventDefault();
    if (problem) return;
    if (toHandle && !review) {
      reviewHandle();
      return;
    }
    const to = toHandle ? review.address : recipient;
    execute(async () => {
      if (toHandle) {
        // Checked once more against a fresh copy: a handle released or moved
        // since the review is never paid.
        const r = await handleDirectory.resolveForPayment(recipient);
        if (!r.ok || r.entry.address !== to) throw new Error(r.ok ? `@${review.handle} changed since the review. Review it again.` : r.reason);
      }
      // The chain refuses to shield a send-disabled denom (chain 203d3b2).
      if ((await sendEnabled(UERTH)) === false) {
        throw new Error("Transfers of ERTH are switched off on the chain right now, so it cannot be shielded. Nothing was sent.");
      }
      // Fresh rho, rcm and ephemeral key for every attempt: a retry never
      // reuses the note secrets of one that may already have landed.
      const { msg, cm } = shieldTo(address, to, micro, { memo });
      const tx = await broadcast([msg]);
      setDone({ hash: tx.txhash, cm, amount: formatUnits(micro, UERTH), to: toHandle ? `@${review.handle}` : null });
      setReview(null);
      setAmount("");
      setMemo("");
      refresh();
    });
  };

  return (
    <div className={styles.page}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} txHash={txHash} />
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
          <ShieldedAddressInput value={recipient} onChange={setRecipient} allowHandle handleStatus={handleInfo} />

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
          {review && (
            <div className={forms.note}>
              Pay <strong>@{review.handle}</strong> · <span style={{ fontFamily: "monospace" }}>{truncateAddress(review.address)}</span>
              <br />
              The amount and this account are public; who holds the handle is not.
            </div>
          )}
          <button className={forms.button} type="submit" disabled={Boolean(problem)}>
            {!isConnected ? "Connect Keplr to shield" : toHandle ? (review ? `Shield to @${review.handle}` : "Review") : "Shield"}
          </button>
        </form>

        {done && (
          <div className={styles.kv} style={{ marginTop: 12 }}>
            <div className={styles.kvLabel}>Shielded {done.amount} ERTH{done.to ? ` to ${done.to}` : ""}</div>
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
