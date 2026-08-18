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
      <h1>Privacy Policy for Earth Wallet</h1>
      <p className={styles.lastUpdated}><strong>Last updated:</strong> {new Date().toLocaleDateString()}</p>

      <p>Earth Network ("we", "our", or "us") operates the Earth Wallet mobile application (the "Service").</p>

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
          <li><strong>Backend:</strong> Limited communication with our servers for network status and, if you choose to watch an advert for transaction fees, to send you that grant</li>
          <li><strong>No Personal Data:</strong> No personal information is transmitted in these communications</li>
        </ul>
      </section>

      <section>
        <h2>DATA SECURITY</h2>
        <ul>
          <li>Passport reading and proof generation happen entirely on your device</li>
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
          updating the "Last updated" date.
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
