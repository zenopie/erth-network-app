import React, { useState } from 'react';
import { queryRegistryAndGetTokens } from '../utils/contractUtils';
import styles from './Login.module.css';
import keplrLogo from '../images/keplr-logo-white.png';

const Login = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Check if Keplr is installed
      if (!window.keplr) {
        throw new Error('Please install Keplr extension');
      }

      const chainId = 'secret-4';

      // Enable Keplr
      await window.keplr.enable(chainId);

      // Get the user's address
      const offlineSigner = window.getOfflineSignerOnlyAmino(chainId);
      const accounts = await offlineSigner.getAccounts();

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found in Keplr');
      }

      const userAddress = accounts[0].address;

      // Query registry and get token addresses for permit (also populates contracts/tokens)
      const tokenAddresses = await queryRegistryAndGetTokens();

      // Calculate expiration: 1 week from now (in seconds)
      const oneWeekInSeconds = 7 * 24 * 60 * 60;
      const expirationTimestamp = Math.floor(Date.now() / 1000) + oneWeekInSeconds;

      // Create permit for signing with all token addresses and 1 week expiration
      const permit = {
        chain_id: chainId,
        account_number: "0",
        sequence: "0",
        msgs: [
          {
            type: "query_permit",
            value: {
              permit_name: "erth_network_login",
              allowed_tokens: tokenAddresses,
              permissions: ["owner"]
            }
          }
        ],
        fee: {
          amount: [{ denom: "uscrt", amount: "0" }],
          gas: "1"
        },
        memo: "Create viewing permit"
      };

      console.log("Requesting permit signature...");

      // Sign the permit
      const signedPermit = await window.keplr.signAmino(
        chainId,
        userAddress,
        permit,
        {
          preferNoSetFee: true,
          preferNoSetMemo: true
        }
      );

      // Clear any existing permit first
      localStorage.removeItem('erth_login_permit');
      localStorage.removeItem('erth_user_address');
      localStorage.removeItem('erth_permit_expiration');

      // Store the permit in localStorage with the wallet address
      const permitData = {
        params: {
          permit_name: "erth_network_login",
          allowed_tokens: tokenAddresses,
          chain_id: chainId,
          permissions: ["owner"]
        },
        signature: signedPermit.signature
      };

      // Store new permit, address, and expiration
      localStorage.setItem('erth_login_permit', JSON.stringify(permitData));
      localStorage.setItem('erth_user_address', userAddress);
      localStorage.setItem('erth_permit_expiration', expirationTimestamp.toString());

      console.log("Login permit signed successfully for:", userAddress);

      // Call the success callback
      onLoginSuccess(userAddress, permitData);

    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.loginWrapper}>
      <div className={styles.container}>
        <div className={styles.titleContainer}>
          <img src="/images/logo.png" alt="ERTH Network" className={styles.logo} />
          <h2 className={styles.title}>Welcome to ERTH Network</h2>
        </div>

        {error && (
          <div className={styles.errorBox}>
            <i className="bx bx-error-circle"></i>
            <span>{error}</span>
          </div>
        )}

        <button
          className={styles.primaryButton}
          onClick={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className={styles.spinner}></span>
              Connecting...
            </>
          ) : (
            <>
              Sign in with <img src={keplrLogo} alt="Keplr" className={styles.keplrLogo} />
            </>
          )}
        </button>

        <p className={styles.disclaimer}>
          Signing in will create a permit to view your private balances
        </p>
      </div>
    </div>
  );
};

export default Login;
