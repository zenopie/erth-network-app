import React, { useEffect } from 'react';
import './ANMLClaim.css';
import { query, contract } from '../utils/contractUtils';
import { showLoadingScreen } from '../utils/uiUtils';

// Import images
import passportImage from '../images/passport.png';
import anmlImage from '../images/anml.png';
import watermelonImage from '../images/watermelon.png';

const REGISTRATION_CONTRACT = "secret1td09kmwqrq3gm67c0g95nlfwhk5dwjyxzm8apc";
const REGISTRATION_HASH = "8d8a898811c62ec6b79668fd1167d7f57001787019d4931de13185676e19e4ba";

const ANMLClaim = ({ isKeplrConnected }) => {
  // Verification Status Check
  const check_verification_status = async () => {
    console.log("Entering check_verification_status");
    showLoadingScreen(true);
    let querymsg = {
      registration_status: {
        address: window.secretjs.address
      }
    };
    let anml_status = "not_verified";
    let contract_value = await query(REGISTRATION_CONTRACT, REGISTRATION_HASH, querymsg);
    if (contract_value.registration_status === true) {
      const now = Date.now();
      const oneDayInMillis = 24 * 60 * 60 * 1000; // 86,400,000 milliseconds in a day
      let next_claim = contract_value.last_claim / 1000000 + oneDayInMillis; // divide to turn nanos into milliseconds then add one day
      if (now > next_claim) {
        anml_status = "claimable";
      } else {
        anml_status = "claimed";
      }
    } else {
      const pending_check_url = '/api/pending/' + window.secretjs.address;
      await fetch(pending_check_url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('GET request successful:', data);
          if (data.pending) {
            anml_status = "pending";
          }
        })
        .catch(error => {
          console.error('Error:', error);
        });
    }
    console.log("Anml Status:", anml_status);
    if (anml_status === "claimable") {
      showLoadingScreen(false);
      document.querySelector("#claim-box").classList.remove("remove");
    } else if (anml_status === "claimed") {
      document.querySelector("#complete-box").classList.remove("remove");
      showLoadingScreen(false);
    } else if (anml_status === "not_verified") {
      showLoadingScreen(false);
      document.querySelector("#register-box").classList.remove("remove");
    } else if (anml_status === "pending") {
      showLoadingScreen(false);
      document.querySelector("#pending-box").classList.remove("remove");
    }
    console.log("Exiting check_verification_status");
  }

  const registerButton = () => {
    console.log("Register button clicked");
    showLoadingScreen(true);

    if (typeof veriff !== 'undefined') {
      const veriff = veriff({
        host: 'https://stationapi.veriff.com',
        apiKey: '0c926c59-8076-42a5-a7a3-80727c13e461',
        parentId: 'veriff-root',
        onSession: function(err, response) {
          window.location.href = response.verification.url;
        }
      });

      veriff.setParams({
        person: {
          givenName: ' ',
          lastName: ' '
        },
        vendorData: window.secretjs.address
      });
      veriff.mount();
    } else {
      console.error("Veriff is not loaded");
    }

    document.querySelector("#register-box").classList.add("remove");
    document.querySelector("#disclaimer-box").classList.remove("remove");
    showLoadingScreen(false);
  }

  const claimButton = async () => {
    console.log("Claim button clicked");
    showLoadingScreen(true);
    let contractmsg = {
      claim: {}
    };
    let tx = await contract(REGISTRATION_CONTRACT, REGISTRATION_HASH, contractmsg);

    if (tx.arrayLog) {
      const logEntry = tx.arrayLog.find(
        (log) => log.type === "message" && log.key === "result"
      );
      document.querySelector('#claim-box').classList.add('remove');
      document.querySelector("#complete-box").classList.remove("remove");
    } else {
      console.log("claim error");
    }
    showLoadingScreen(false);
  }

  useEffect(() => {
    if (isKeplrConnected) {
      check_verification_status(); // Run verification check once Keplr is connected
    }
  }, [isKeplrConnected]);

  return (
      <div className="home-content">
        <div className="menu-toggle">
          <i className='bx bx-menu'></i>
        </div>


        <div id="register-box" className="test-box remove">
          <img src={passportImage} width={350} alt="Logo" style={{ filter: 'drop-shadow(25px 25px 25px #aaa)' }} className="logo-img" />
          <button onClick={registerButton} className="claim-button">Register</button>
        </div>

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
