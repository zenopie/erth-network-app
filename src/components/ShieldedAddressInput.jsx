import React, { useEffect, useRef, useState } from "react";
import forms from "../pages/Forms.module.css";
import { decodeShieldedAddress } from "../chain/shieldedAddress";

// An erthz address anywhere in a scanned string (a bare address, or one
// wrapped in a URI by the app's QR code).
const ADDRESS_IN_TEXT = /erthz1[02-9ac-hj-np-z]{110}/i;

const canScan = () => typeof window !== "undefined" && "BarcodeDetector" in window;

/**
 * A recipient field for a shielded (erthz1…) address: validated as it is
 * typed or pasted, with a QR scan where the browser has a BarcodeDetector
 * (camera, or a photo/screenshot of the code). `onChange(text)` gets the raw
 * text; the parent decodes it again when it builds the msg.
 */
const ShieldedAddressInput = ({ value, onChange }) => {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef(null);
  const fileRef = useRef(null);

  let status = null;
  if (value.trim()) {
    try {
      decodeShieldedAddress(value);
      status = { ok: true, text: "Valid shielded address." };
    } catch (e) {
      status = { ok: false, text: e.message };
    }
  }

  const accept = (raw) => {
    const m = ADDRESS_IN_TEXT.exec(raw ?? "");
    if (!m) {
      setScanError("That QR code does not contain a shielded erthz1… address.");
      return false;
    }
    onChange(m[0]);
    setScanError("");
    return true;
  };

  // Camera scan loop while `scanning`.
  useEffect(() => {
    if (!scanning) return undefined;
    let stream = null;
    let stopped = false;
    let timer = null;
    (async () => {
      try {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) return;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            for (const c of codes) {
              if (accept(c.rawValue)) {
                setScanning(false);
                return;
              }
            }
          } catch {
            /* frame not ready */
          }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        setScanError(`Camera unavailable: ${e.message}. Paste the address, or scan a screenshot.`);
        setScanning(false);
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // accept/onChange are stable enough for a scan session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const scanFile = async (file) => {
    if (!file) return;
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(await createImageBitmap(file));
      if (!codes.length) setScanError("No QR code found in that image.");
      else accept(codes[0].rawValue);
    } catch (e) {
      setScanError(`Could not read that image: ${e.message}`);
    }
  };

  return (
    <div>
      <label className={forms.label} htmlFor="shielded-recipient">
        Recipient&apos;s shielded address
      </label>
      <div className={forms.formRow}>
        <textarea
          id="shielded-recipient"
          className={`${forms.textarea} ${forms.field}`}
          style={{ minHeight: 64, fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}
          placeholder="erthz1…"
          spellCheck={false}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {canScan() && (
        <div className={forms.formRow}>
          <button type="button" className={forms.ghostButton} onClick={() => setScanning((s) => !s)}>
            {scanning ? "Stop camera" : "Scan QR"}
          </button>
          <button type="button" className={forms.ghostButton} onClick={() => fileRef.current?.click()}>
            Scan a screenshot
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              scanFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {scanning && (
        <video ref={videoRef} muted playsInline style={{ width: "100%", maxWidth: 320, borderRadius: 12, marginBottom: 10 }} />
      )}
      {scanError && <div className={forms.warn}>{scanError}</div>}
      {status && (
        <div className={status.ok ? forms.note : forms.warn} style={status.ok ? { color: "#15803d" } : undefined}>
          {status.text}
        </div>
      )}
    </div>
  );
};

export default ShieldedAddressInput;
