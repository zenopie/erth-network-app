import { useEffect } from "react";
import { useLoading } from "../contexts/LoadingContext";
import styles from "./PrivacyPolicy.module.css";

const PrivacyPolicy = () => {
  const { hideLoading } = useLoading();

  useEffect(() => {
    hideLoading();
  }, []);
  return (
    <div className={styles.privacyPolicyContainer}>
      <h1>Privacy Policy for Earth Wallet and the Earth Network web app</h1>
      <p className={styles.lastUpdated}><strong>Last updated:</strong> October 3, 2026</p>

      <p>
        Earth Network ("we", "our", or "us") operates the Earth Wallet mobile application and the Earth Network web app
        at erth.network (together, the "Service"). The sections below say which part each applies to.
      </p>

      <section>
        <h2>INFORMATION WE COLLECT AND PROCESS</h2>

        <h3>Camera Permission</h3>
        <ul>
          <li><strong>Purpose:</strong> Earth Wallet uses your device's camera to scan passport documents for identity verification</li>
          <li><strong>Processing:</strong> Camera data is processed locally on your device for document scanning purposes</li>
          <li><strong>Storage:</strong> We do not store, save, or retain camera images or video data</li>
          <li><strong>Control:</strong> Camera access can be revoked at any time through your device settings</li>
        </ul>

        <h3>Passport Document Processing</h3>
        <ul>
          <li><strong>Data Collection:</strong> When you scan your passport, we temporarily access document information for verification</li>
          <li><strong>Processing Method:</strong> Passport data is read on your device and used to build a zero-knowledge proof there. The proof shows that a validly signed passport was read, without revealing anything it contains</li>
          <li><strong>Data Retention:</strong> We do NOT retain, store, or have access to your passport information, personal details, or biometric data</li>
          <li><strong>Output:</strong> Only the proof and a one-way identifier derived from it are broadcast. The identifier is what stops one passport registering twice; it cannot be reversed into your passport</li>
          <li><strong>Security:</strong> The passport data never leaves your device. This is a property of where the proof is generated, not a promise about how we handle data we receive — we do not receive it</li>
        </ul>

        <h3>Wallet Data</h3>
        <ul>
          <li><strong>Local Storage:</strong> Wallet keys and transaction data are stored locally on your device using encryption</li>
          <li><strong>No Transmission:</strong> We do not collect, transmit, or share wallet data with external servers</li>
          <li><strong>User Control:</strong> Users have full control over their wallet data and can delete it at any time</li>
        </ul>

        <h3>Network Communications</h3>
        <ul>
          <li><strong>Blockchain:</strong> The app communicates with the Earth Network blockchain for transaction processing</li>
          <li><strong>Public Ledger:</strong> Earth is a transparent chain. Your address, balances, transactions and votes are readable by anyone — this is not private data, and an address that has been linked to you links everything it has ever done</li>
          <li><strong>Handles:</strong> To pay a handle, or check one named as your referrer, the app downloads the whole handle directory and searches it on your phone; no server is told which handle you pay or who referred you</li>
          <li><strong>Private notes:</strong> To find your private (shielded) notes, the app downloads the chain's encrypted notes from our indexer and tries to decrypt them on your device. The indexer serves everyone the same data and is not told which notes are yours</li>
          <li><strong>Free gas for registration:</strong> A first registration has no ERTH to pay its fee with, so the app may ask our server for a small gas grant. The request carries the registration transaction about to be broadcast (public on the chain once it lands) and, when the server asks for one, a proof of work computed on your phone. The server checks the registration the way the chain would and sends the gas to a private note; no device identifier or attestation is sent</li>
          <li><strong>No Personal Data:</strong> No personal information is transmitted in these communications. Like any server, ours see the IP address a request comes from</li>
        </ul>
      </section>

      <section>
        <h2>THE WEB APP</h2>
        <ul>
          <li><strong>No account, no tracking:</strong> The web app has no sign-up, no analytics, no advertising and no third-party scripts or fonts. Everything it loads comes from erth.network</li>
          <li><strong>Keplr:</strong> Transactions are signed in the Keplr browser extension; the web app never sees your keys. Connecting shares your Keplr account's public address with the page</li>
          <li><strong>Chain reads:</strong> The page reads public chain data from our LCD and RPC nodes (lcd.erth.network, rpc.erth.network), which see your IP address and the addresses, transactions and blocks you look up, like any web server</li>
          <li><strong>Stored in your browser:</strong> The connected address, your display-currency choice and the hash of a transaction whose outcome is not yet known (so it is not sent twice) are kept in your browser's local storage. Clearing site data removes them</li>
          <li><strong>Camera:</strong> Scanning a shielded address QR code uses your camera only while the scanner is open; frames are read in the browser and never uploaded</li>
          <li><strong>Handles:</strong> To pay or look up a handle, the page downloads the whole handle directory (from our indexer, api.erth.network, and from the LCD) and searches it in your browser; it never asks about the one handle you look up or pay. The shield transaction's amount and your account are public; who holds the handle is not</li>
          <li><strong>Buying ANML for a shielded address:</strong> The ERTH spent and the ANML bought are public on the chain; who receives the note is not</li>
        </ul>
      </section>

      <section>
        <h2>DATA SECURITY</h2>
        <ul>
          <li>Passport reading and proof generation happen entirely on your device (mobile app only; the web app never reads a passport)</li>
          <li>Local data is encrypted using industry-standard encryption</li>
          <li>Network communications use secure protocols</li>
          <li>We employ privacy-by-design principles throughout the application</li>
        </ul>
      </section>

      <section>
        <h2>YOUR RIGHTS</h2>
        <ul>
          <li><strong>Access Control:</strong> You control all permissions granted to the app</li>
          <li><strong>Data Deletion:</strong> You can delete all local app data at any time</li>
          <li><strong>Permission Revocation:</strong> Camera and other permissions can be revoked through device settings</li>
        </ul>
      </section>

      <section>
        <h2>CHANGES TO THIS POLICY</h2>
        <p>
          We may update this privacy policy from time to time. We will notify users of any changes by posting the new policy in the app and
          on this page, and updating the "Last updated" date.
        </p>
      </section>

      <section>
        <h2>CONTACT US</h2>
        <p>If you have questions about this privacy policy or our privacy practices, contact us at:</p>
        <ul>
          <li><strong>Email:</strong> braydnl@erth.network</li>
        </ul>
      </section>

      <hr />
      <p className={styles.policyFooter}>
        <em>This policy reflects our commitment to protecting your privacy through cryptographic security and minimal data collection.</em>
      </p>
    </div>
  );
};

export default PrivacyPolicy;
