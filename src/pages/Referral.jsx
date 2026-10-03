import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useLoading } from "../contexts/LoadingContext";
import { validHandle } from "../chain/handles";
import styles from "./PrivacyPolicy.module.css";

// erth.network/ref/<handle> opens Earth Wallet directly when it is installed
// (Android App Links via assetlinks.json, iOS universal links via
// apple-app-site-association). This page is what everyone else sees: the
// handle to type in at registration. No lookup is made, so opening a link
// tells no one which handle it carries.
const Referral = () => {
  const { hideLoading } = useLoading();
  const { handle = "" } = useParams();
  const ok = validHandle(handle);

  useEffect(() => {
    hideLoading();
  }, []);

  return (
    <div className={styles.privacyPolicyContainer}>
      <h1>Join Earth</h1>
      {ok ? (
        <p>
          You were referred by <strong>@{handle}</strong>. Install Earth Wallet, and when you register, enter{" "}
          <strong>@{handle}</strong> under "Referred by".
        </p>
      ) : (
        <p>This referral link is not valid. Install Earth Wallet and ask the person who sent it for their handle.</p>
      )}
      <p>If Earth Wallet is already installed, open this link on your phone and it will open in the app.</p>
    </div>
  );
};

export default Referral;
