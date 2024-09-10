import React, { useState, useEffect } from 'react';
import './ANMLClaim.css';
import { query, contract } from '../utils/contractUtils';
import { showLoadingScreen } from '../utils/uiUtils';
import { Veriff } from '@veriff/js-sdk'; // Import Veriff SDK
import StatusModal from '../components/StatusModal'; 

// Import images
import passportImage from '../images/passport.png';
import anmlImage from '../images/anml.png';
import watermelonImage from '../images/watermelon.png';

const REGISTRATION_CONTRACT = "secret12q72eas34u8fyg68k6wnerk2nd6l5gaqppld6p";
const REGISTRATION_HASH = "56b23939334e37ab046d9b9a64134289512e9b40b7cbe738a9385f7ddfdbe40d";


const ANMLClaim = ({ isKeplrConnected }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState('loading'); // 'loading', 'success', 'error'

  // Function to check the verification status
  const checkVerificationStatus = async () => {
    console.log("Entering checkVerificationStatus");
    showLoadingScreen(true);

    let querymsg = {
      query_registration_status: {
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
  
      try {
        const veriff = Veriff({
          apiKey: "0c926c59-8076-42a5-a7a3-80727c13e461", // Replace with your actual API key
          parentId: "veriff-root", // The ID of the element where Veriff will be mounted
          onSession: function (err, response) {
            if (err) {
              console.error("Veriff session error:", err);
              return;
            }
            // Redirect to the verification URL
            window.location.href = response.verification.url;
          }
        });
  
        // Set the person and vendor data as per your original code
        veriff.setParams({
          person: {
            givenName: " ", // You can dynamically fetch and pass user data here
            lastName: " "
          },
          vendorData: window.secretjs.address // Replace with the actual address if necessary
        });
  
        veriff.mount(); // This initializes the Veriff flow in the specified parent element
  
        // Handle any class manipulations (e.g., hiding/showing certain elements)
        document.querySelector(".test-box").classList.add("remove");
        document.querySelector("#disclaimer-box").classList.remove("remove");
  
      } catch (error) {
        console.error("Error initializing Veriff:", error);
      }
    };

  // Function to handle the claim button click
  const claimButton = async () => {

    setIsModalOpen(true);  // Open the modal and show loading animation
    setAnimationState('loading');  // Set the state to loading when the swap starts

    let contractmsg = {
      claim: {}
    };

    try {
      let tx = await contract(REGISTRATION_CONTRACT, REGISTRATION_HASH, contractmsg);
      if (tx.arrayLog) {
        setAnimationState('success'); // Set the animation state to success after a successful claim
        document.querySelector('#claim-box').classList.add('remove');
        document.querySelector("#complete-box").classList.remove("remove");
      } else {
        // Manually throw an error to trigger the catch block
        throw new Error("Claim transaction failed, no arrayLog.");
      }
    } catch (error) {
      console.error("Error during claim:", error);
      setAnimationState('error'); 
    } 
  };


  // useEffect to check verification status once Keplr is connected
  useEffect(() => {
    if (isKeplrConnected) {
      checkVerificationStatus(); // Run verification check once Keplr is connected
    }
  }, [isKeplrConnected]);

  return (
    <>
      {/* Modal for displaying swap status */}
      <StatusModal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              animationState={animationState}
          />

      <div id="register-box" className="test-box remove">
        <img src={passportImage} width={350} alt="Logo" style={{ filter: 'drop-shadow(25px 25px 25px #aaa)' }} className="logo-img" />
        <button onClick={registerButton} className="claim-button">Register</button>
      </div>


      <div id="claim-box" className="test-box remove">
        <img src={anmlImage} alt="Logo" className="logo-img" />
        <button onClick={claimButton} className="claim-button">Claim</button>
        
      </div>

      <div className="test-box remove" id="disclaimer-box">
          <i className='bx bx-error-alt'></i>
          <span className="disclaimer-text"><b>DISCLAIMER:</b> In order to secure proof of humanity, your currently connected wallet address will be associated with your identity.</span>
          <div id='veriff-root'></div>
      </div>



      <div id="pending-box" className="test-box remove">
        <i className='bx bx-hourglass status-icon'></i>
        <span className="disclaimer-text">Your verification is now pending. Please allow up to 24 hours to verify. This page will be updated when complete</span>
      </div>

      <div id="complete-box" className="test-box remove">
        <img src={watermelonImage} width={350} alt="Logo" className="logo-img" />
        <span className="success-text">CLAIMED! see you tomorrow!</span>
      </div>
    </>
  );
}

export default ANMLClaim;
