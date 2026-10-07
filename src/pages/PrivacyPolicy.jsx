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
      <p className={styles.lastUpdated}><strong>Last updated:</strong> October 6, 2026</p>

      <p>
        Earth Network ("we", "our", or "us") operates the Earth Wallet mobile application and the Earth Network web app
        at erth.network (together, the "Service"). The sections below say which part each applies to.
      </p>

      <p>
        The rule Earth is built on: <strong>people are private; power and public money are public.</strong> What you
        hold and what you do as a person is meant to stay private. Decisions about shared money (allocations, pools,
        validators) are public. This policy says plainly where that line falls, and where it does not hold.
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
          <li><strong>On your device:</strong> Earth Wallet reads your passport's chip on your phone and builds a zero-knowledge proof there. Your name, photo, date of birth and passport number are not sent to us or to the chain, and we do not store them</li>
          <li><strong>What the proof shows:</strong> That a passport signed by a genuine issuing authority was read. It does not show your name, photo, date of birth or passport number</li>
          <li><strong>What every registration makes public, permanently:</strong> each registration is recorded on the chain, where anyone can read it. The record holds:
            <ul>
              <li>the passport's <strong>issuing country</strong></li>
              <li>which <strong>signing certificate</strong> signed the passport (the passport office's Document Signer certificate, recorded as a commitment to it). One certificate signs one country's passports over a few months, so for a small country it narrows down who you might be</li>
              <li><strong>when</strong> you registered</li>
              <li>the <strong>referrer handle</strong>, if you entered one under "Referred by"</li>
              <li>the <strong>passport identifier</strong> (below)</li>
            </ul>
          </li>
          <li><strong>The passport identifier:</strong> to stop one passport registering twice, each registration publishes a fixed identifier computed from the passport's issuing country, document number and date of birth (plus the number's check digit and the optional-data field). It cannot be turned back into those details. But anyone who already has them can compute the same identifier and look it up: the issuing state, or anyone who has seen or copied your passport's photo page, such as a hotel, an airline, an identity-check provider or a leaked database. They learn that your passport registered, when, under which signing certificate, and which referrer handle it named. Where document numbers are predictable, someone who knows your country and date of birth may be able to guess the identifier too</li>
          <li><strong>What the identifier is not linked to:</strong> nothing on the chain connects it to your wallet, balances, claims, votes, handle or stake after registration. Those use proofs made from a secret on your phone. Network data and timing can still link them (see Network Communications)</li>
        </ul>

        <h3>Wallet Data</h3>
        <ul>
          <li><strong>Local Storage:</strong> Your recovery phrase, keys and wallet history are stored on your device using encryption. We never receive your recovery phrase or keys</li>
          <li><strong>User Control:</strong> You can delete your wallet data from the device at any time. The recovery phrase is the only backup</li>
        </ul>

        <h3>What is public on the chain, and what is private</h3>
        <ul>
          <li><strong>Private:</strong> shielded ERTH balances and transfers, ANML, staking from your shielded balance, liquidity added from your shielded balance, your assembly votes, who cast each Caretaker split and who owns each Groundworks position. For these the chain records only proofs and sealed notes</li>
          <li><strong>Public:</strong> that a transaction happened, and its fee; everything done from an ordinary (transparent) account, with its address, amounts and history; the amount and account when you shield or unshield; allocations and how much each option earns; pool reserves; validators, their stake and their votes; the handle directory (each handle and the shielded address it names); and every registration (above)</li>
        </ul>

        <h3>Network Communications (Earth Wallet)</h3>
        <ul>
          <li><strong>Our node:</strong> Unless you connect the app to your own node (below), it sends your transactions to, and reads chain data from, our node at lcd.erth.network and rpc.erth.network. To show your balances, staking and history, it asks the node about your wallet's account address</li>
          <li><strong>Cloudflare:</strong> Our node and our server (api.erth.network) are reached through Cloudflare, which handles the encrypted connection. Cloudflare receives the same traffic our servers do: your IP address, each transaction you broadcast, the address queries above, and when each happens</li>
          <li><strong>Free gas for registration:</strong> A registration may have no ERTH to pay its fee with, so for any registration (a first one, a renewal or a switch) the app may ask our server for a small gas grant. The request carries the registration transaction about to be broadcast, including its passport identifier and referrer handle, and, when the server asks for one, a proof of work computed on your phone. The server checks the registration the way the chain would and sends the gas to a private note. For each grant it keeps the passport identifier, the day, whether it was a new registration (a first one or a renewal) or a switch, and the time, for 31 days, so that one passport gets one grant in 30 days. No device identifier or attestation is sent</li>
          <li><strong>What this traffic could reveal:</strong> Your IP address arrives next to your passport identifier (in a gas-grant request) and next to your wallet address (in balance checks and broadcasts). Matching the two by IP address would link your passport to your wallet</li>
          <li><strong>Our no-logs policy:</strong> Our node, our server and this web app do not store client IP addresses, request paths or gas-request identifiers. Rate limits use short-lived counters held in memory only. The one record kept is the gas grant's record, above. This covers what our servers store; it does not cover the two parties below</li>
          <li><strong>Cloudflare:</strong> Cloudflare is a separate company, and what it records is governed by its own privacy policy. We turn off every Cloudflare log export and analytics feature we can, and the protections that challenge requests on Cloudflare's own judgement (Browser Integrity Check, Security Level, Bot Fight Mode). What remains is visible to us as well, for Cloudflare's retention period, and we do not export it: its Security Events log, with IP address, path, query and user agent, for requests that one of our firewall or rate-limit rules blocks or that Cloudflare's always-on DDoS protection mitigates; and its analytics, with aggregate traffic and a sample of individual requests (IP address, path, country, user agent) whether or not a rule matched them</li>
          <li><strong>Hosting providers:</strong> Our node, our server and this web app run as containers on Akash, a marketplace of independent hosting providers, behind Cloudflare. The provider running a container can, in principle, read its memory, disk and output, including requests after Cloudflare decrypts them, which carry your IP address. So the provider hosting our server could see your IP next to a gas request's passport identifier, the provider hosting our node could see it next to your address queries and broadcasts, and the provider hosting this web app could see the pages you load (for example a /ref/ link with its handle). Apart from the gas-grant record above, which is stored on our server's disk and so readable by its provider, our services write nothing identifying to disk or to their logs</li>
          <li><strong>A promise, not a proof:</strong> You cannot verify that a server keeps no logs. We, Cloudflare and our hosting providers could see this traffic in principle; the no-logs policy is something you trust us on. To avoid trusting us, connect the app to a node you run yourself (Settings → Network), and use a VPN or Tor, especially for registration. With your own node, the handle directory, the private note streams, the gas grant and circuit downloads still come from our server; all but the gas grant are the same data for everyone</li>
          <li><strong>Handles:</strong> To pay a handle, the app downloads the whole handle directory and searches it on your phone; no server is told which handle you pay</li>
          <li><strong>Private notes:</strong> To find your private (shielded) notes, the app downloads the chain's encrypted notes from our indexer and tries to decrypt them on your device. The indexer serves everyone the same data and is not told which notes are yours</li>
        </ul>
      </section>

      <section>
        <h2>THE WEB APP</h2>
        <ul>
          <li><strong>No account, no tracking:</strong> The web app has no sign-up, no analytics, no advertising and no third-party scripts or fonts. Everything it loads comes from erth.network</li>
          <li><strong>Keplr:</strong> Transactions are signed in the Keplr browser extension; the web app never sees your keys. Connecting shares your Keplr account's public address with the page</li>
          <li><strong>Keplr transactions are public:</strong> Keplr signs from an ordinary (transparent) account, so every transaction you make in the web app (swaps, allocations, shielding, auction bids) is public on the chain with your address and amounts</li>
          <li><strong>Chain reads:</strong> The page reads public chain data from our LCD and RPC nodes (lcd.erth.network, rpc.erth.network), reached through Cloudflare, and always uses them. They receive your IP address, the transactions you broadcast, and the addresses, transactions and blocks you look up. The no-logs policy above applies to them too</li>
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
          <li>Network communications use secure protocols (TLS)</li>
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
        <em>People are private; power and public money are public. Anything this policy calls public is public permanently.</em>
      </p>
    </div>
  );
};

export default PrivacyPolicy;
