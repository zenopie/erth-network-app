import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useLoading } from "../contexts/LoadingContext";
import { validHandle } from "../chain/handles";
import styles from "./PrivacyPolicy.module.css";

// erth.network/ref/<handle> opens Earth Wallet directly when it is installed
// (Android App Links via assetlinks.json, iOS universal links via
// apple-app-site-association). This page is what everyone else sees: the
// handle to type in at registration, and that the handle is published with
// the registration (MsgRegister affiliate_handle). No lookup is made, so opening a link
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
      {ok && (
        <p>
          A referrer handle is public. If you enter one, it is recorded on the chain with your registration
          permanently, next to your passport's country, its signing certificate and the time you registered. Anyone who
          can work out your registration (see the <Link to="/privacy-policy">privacy policy</Link>) can then see who referred you.
          Leaving "Referred by" empty is fine.
        </p>
      )}
      <p>If Earth Wallet is already installed, open this link on your phone and it will open in the app.</p>
    </div>
  );
};

export default Referral;
