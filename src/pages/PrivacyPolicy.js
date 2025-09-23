import { useEffect } from "react";
import { showLoadingScreen } from "../utils/uiUtils";
import "./PrivacyPolicy.css";

const PrivacyPolicy = () => {
  useEffect(() => {
    showLoadingScreen(false);
  }, []);
  return (
    <div className="privacy-policy-container">
      <h1>Privacy Policy for Earth Wallet</h1>
      <p className="last-updated"><strong>Last updated:</strong> {new Date().toLocaleDateString()}</p>

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
          <li><strong>Processing Method:</strong> Passport data is processed in a Trusted Execution Environment (TEE) to generate a cryptographic identity hash</li>
          <li><strong>Data Retention:</strong> We do NOT retain, store, or have access to your passport information, personal details, or biometric data</li>
          <li><strong>Output:</strong> Only the anonymized cryptographic hash is used for identity verification on the blockchain</li>
          <li><strong>Security:</strong> The TEE ensures that passport data cannot be accessed, viewed, or extracted by the application or any external parties</li>
        </ul>

        <h3>Wallet Data</h3>
        <ul>
          <li><strong>Local Storage:</strong> Wallet keys and transaction data are stored locally on your device using encryption</li>
          <li><strong>No Transmission:</strong> We do not collect, transmit, or share wallet data with external servers</li>
          <li><strong>User Control:</strong> Users have full control over their wallet data and can delete it at any time</li>
        </ul>

        <h3>Network Communications</h3>
        <ul>
          <li><strong>Blockchain:</strong> The app communicates with the Secret Network blockchain for transaction processing</li>
          <li><strong>Backend:</strong> Limited communication with our servers for app updates and network status</li>
          <li><strong>No Personal Data:</strong> No personal information is transmitted in these communications</li>
        </ul>
      </section>

      <section>
        <h2>DATA SECURITY</h2>
        <ul>
          <li>All sensitive operations are performed in secure environments (TEE)</li>
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
      <p className="policy-footer">
        <em>This policy reflects our commitment to protecting your privacy through cryptographic security and minimal data collection.</em>
      </p>
    </div>
  );
};

export default PrivacyPolicy;