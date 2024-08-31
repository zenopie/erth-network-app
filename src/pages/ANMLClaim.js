import React, { useEffect } from 'react';
import './ANMLClaim.css';
import { query, contract } from '../utils/contractUtils';
import { showLoadingScreen } from '../utils/uiUtils';
import { Veriff } from '@veriff/js-sdk'; // Import Veriff SDK

// Import images
import passportImage from '../images/passport.png';
import anmlImage from '../images/anml.png';
import watermelonImage from '../images/watermelon.png';

const REGISTRATION_CONTRACT = "secret12q72eas34u8fyg68k6wnerk2nd6l5gaqppld6p";
const REGISTRATION_HASH = "ad7583f22bae9cc8277dfb1bbcc60b88aa4702f58df1f536293a26b5bdc17dfc";


const ANMLClaim = ({ isKeplrConnected }) => {

  // Function to check the verification status
  const checkVerificationStatus = async () => {
    console.log("Entering checkVerificationStatus");
    showLoadingScreen(true);

    let querymsg = {
      registration_status: {
        address: window.secretjs.address
      }
    };

    let anmlStatus = "not_verified";
    let contractValue = await query(REGISTRATION_CONTRACT, REGISTRATION_HASH, querymsg);

    if (contractValue.registration_status === true) {
      const now = Date.now();
      const oneDayInMillis = 24 * 60 * 60 * 1000; // 86,400,000 milliseconds in a day
      let nextClaim = contractValue.last_claim / 1000000 + oneDayInMillis; // convert nanos to millis and add one day
      anmlStatus = now > nextClaim ? "claimable" : "claimed";
    } else {
      const pendingCheckUrl = `/api/pending/${window.secretjs.address}`;
      try {
        const response = await fetch(pendingCheckUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        if (data.pending) {
          anmlStatus = "pending";
        }
      } catch (error) {
        console.error('Error:', error);
      }
    }

    console.log("Anml Status:", anmlStatus);

    // Update UI based on the status
    document.querySelectorAll('.test-box').forEach(box => box.classList.add('remove'));
    if (anmlStatus === "claimable") {
      document.querySelector("#claim-box").classList.remove("remove");
    } else if (anmlStatus === "claimed") {
      document.querySelector("#complete-box").classList.remove("remove");
    } else if (anmlStatus === "not_verified") {
      document.querySelector("#register-box").classList.remove("remove");
    } else if (anmlStatus === "pending") {
      document.querySelector("#pending-box").classList.remove("remove");
    }
    showLoadingScreen(false);
    console.log("Exiting checkVerificationStatus");
  }

  // Function to handle the register button click and start the Veriff verification
  const registerButton = () => {
    console.log("Register button clicked");
    showLoadingScreen(true);

    try {
      const veriff = Veriff({
        apiKey: 'YOUR_API_KEY', // Replace with your actual API key
        parentId: 'veriff-root',
        onSession: function (err, response) {
          if (err) {
            console.error("Veriff session error:", err);
            return;
          }
          // Redirect to the verification URL
          window.location.href = response.verification.url;

          // Alternatively, you can use the in-context SDK option
          // createVeriffFrame({url: response.verification.url});
        }
      });

      veriff.mount(); // This initializes the Veriff flow in the specified parent element

    } catch (error) {
      console.error("Error initializing Veriff:", error);
    }

    showLoadingScreen(false);
  }

  // Function to handle the claim button click
  const claimButton = async () => {
    console.log("Claim button clicked");
    showLoadingScreen(true);
    let contractmsg = {
      claim: {}
    };
    try {
      let tx = await contract(REGISTRATION_CONTRACT, REGISTRATION_HASH, contractmsg);
      if (tx.arrayLog) {
        document.querySelector('#claim-box').classList.add('remove');
        document.querySelector("#complete-box").classList.remove("remove");
      } else {
        console.log("Claim error");
      }
    } catch (error) {
      console.error("Error during claim:", error);
    } finally {
      showLoadingScreen(false);
    }
  }

  // useEffect to check verification status once Keplr is connected
  useEffect(() => {
    if (isKeplrConnected) {
      checkVerificationStatus(); // Run verification check once Keplr is connected
    }
  }, [isKeplrConnected]);

  return (
    <div className="home-content">

      <div id="register-box" className="test-box remove">
        <img src={passportImage} width={350} alt="Logo" style={{ filter: 'drop-shadow(25px 25px 25px #aaa)' }} className="logo-img" />
        <button onClick={registerButton} className="claim-button">Register</button>
      </div>

      <div id="veriff-root" style={{ width: '400px', marginTop: '30px' }}></div> {/* Veriff container */}

      <div id="claim-box" className="test-box remove">
        <img src={anmlImage} alt="Logo" className="logo-img" />
        <button onClick={claimButton} className="claim-button">Claim</button>
      </div>

      <div id="disclaimer-box" className="test-box remove">
        <i className='bx bx-error-alt'></i>
        <span className="disclaimer-text"><b>DISCLAIMER:</b> In order to secure proof of humanity your currently connected wallet address will be associated with your identity.</span>
        <div id='veriff-root' style={{ marginTop: '30px' }}></div>
      </div>

      <div id="pending-box" className="test-box remove">
        <i className='bx bx-hourglass status-icon'></i>
        <span className="disclaimer-text">Your verification is now pending. Please allow up to 24 hours to verify. This page will be updated when complete</span>
      </div>

      <div id="complete-box" className="test-box remove">
        <img src={watermelonImage} width={350} alt="Logo" className="logo-img" />
        <span className="success-text"><b>CLAIMED! </b>see you tomorrow!</span>
      </div>
    </div>
  );
}

export default ANMLClaim;
