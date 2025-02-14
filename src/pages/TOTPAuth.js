// src/pages/TOTPAuth.js
import React, { useState, useEffect } from 'react';
import './TOTPAuth.css';
import { QRCodeCanvas } from 'qrcode.react';
import * as base32 from 'hi-base32';
import { connectKeplr, contract as executeContract } from '../utils/contractUtils';
import { showLoadingScreen } from '../utils/uiUtils';

function TOTPAuth() {
  // Hide loading on page mount
  useEffect(() => {
    showLoadingScreen(false);
  }, []);

  // Tabs
  const [activeTab, setActiveTab] = useState('Register');

  // Contract details
  const contractAddress = 'secret1m25lhstggkxfzjsldz0krrhqw6aj58cc3cvler';
  const codeHash = '4360b3f2bbda71d04b10287b7de588ea6439ef6d6c082976ad28975ee8905504';

  // Registration states
  const [walletConnected, setWalletConnected] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [qrCodeData, setQrCodeData] = useState('');
  const [registered, setRegistered] = useState(false);

  // Authentication states
  const [totpCode, setTotpCode] = useState('');
  const [authenticationStatus, setAuthenticationStatus] = useState(null);

  // Switch tabs
  const openTab = (tabName) => {
    setActiveTab(tabName);
  };

  // Generate new secret & auto-register
  const generateSecretAndRegister = async () => {
    try {
      await connectKeplr();
      setWalletConnected(true);

      // Generate a 20-byte random buffer
      const randomBuffer = new Uint8Array(20);
      window.crypto.getRandomValues(randomBuffer);

      // Convert to Base32
      const secret = base32.encode(randomBuffer).replace(/=+$/, '');
      setSecretKey(secret);

      // Build the otpauth URI for the QR code
      const issuer = encodeURIComponent('Secret Auth');
      const label = encodeURIComponent('test-user');
      const otpauth = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      setQrCodeData(otpauth);

      // Immediately register the generated secret
      const msg = { register: { secret_key: secret } };
      const tx = await executeContract(contractAddress, codeHash, msg);
      if (tx.code !== 0) {
        throw new Error(`Registration failed: ${tx.rawLog}`);
      }
      setRegistered(true);
      alert('Registration successful!');
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error(err);
    }
  };

  // Authenticate TOTP code
  const authenticate = async () => {
    try {
      await connectKeplr();
      const msg = { authenticate: { totp_code: totpCode } };
      const tx = await executeContract(contractAddress, codeHash, msg);
      if (tx.code !== 0) {
        throw new Error(`Authentication failed: ${tx.rawLog}`);
      }
      setAuthenticationStatus('success');
      alert('Authentication successful!');
    } catch (err) {
      setAuthenticationStatus('failure');
      alert(`Authentication failed: ${err.message}`);
      console.error(err);
    }
  };

  return (
    <div className="totp-box">
      <h2 className="totp-title">TOTP Authentication</h2>

      {/* Tab navigation */}
      <div className="totp-tab">
        <button
          className={activeTab === 'Register' ? 'active' : ''}
          onClick={() => openTab('Register')}
        >
          Register
        </button>
        <button
          className={activeTab === 'Authenticate' ? 'active' : ''}
          onClick={() => openTab('Authenticate')}
        >
          Authenticate
        </button>
      </div>

      {/* Register tab */}
      {activeTab === 'Register' && (
        <div>
          {/* If wallet isn't connected, show one button to generate & register */}
          {!walletConnected && (
            <button className="totp-button" onClick={generateSecretAndRegister}>
              Generate & Register TOTP
            </button>
          )}
          {/* Once the wallet is connected but no key yet, same button */}
          {walletConnected && !secretKey && (
            <button className="totp-button" onClick={generateSecretAndRegister}>
              Generate & Register TOTP
            </button>
          )}

          {/* Show the key & QR code after generation */}
          {secretKey && (
            <>
              <div className="totp-input-group">
                <div className="totp-label-wrapper">
                  <label className="totp-input-label">Your Secret Key:</label>
                </div>
                <div className="totp-input-wrapper">
                  <input
                    className="totp-input totp-input-left"
                    type="text"
                    readOnly
                    value={secretKey}
                  />
                </div>
              </div>

              <div className="totp-center">
                <div className="totp-label-wrapper">
                  <label className="totp-input-label">
                    Scan with your Authenticator App:
                  </label>
                </div>
                <QRCodeCanvas value={qrCodeData} />
              </div>
            </>
          )}

          {/* Registration success message */}
          {registered && (
            <p className="totp-success">
              You have successfully registered your TOTP secret key.
            </p>
          )}
        </div>
      )}

      {/* Authenticate tab */}
      {activeTab === 'Authenticate' && (
        <div>
          <div className="totp-input-group">
            <div className="totp-label-wrapper">
              <label className="totp-input-label">Enter TOTP Code:</label>
            </div>
            <div className="totp-input-wrapper">
              <input
                className="totp-input totp-input-left"
                type="text"
                placeholder="123456"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
              />
            </div>
          </div>

          <button className="totp-button" onClick={authenticate}>
            Authenticate
          </button>

          {authenticationStatus === 'success' && (
            <p className="totp-success">Authentication successful!</p>
          )}
          {authenticationStatus === 'failure' && (
            <p className="totp-failure">Authentication failed. Please try again.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default TOTPAuth;
