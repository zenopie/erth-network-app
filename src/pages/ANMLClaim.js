import React, { useState, useEffect } from "react";
import "./ANMLClaim.css";
import contracts from "../utils/contracts";
import { query, contract } from "../utils/contractUtils";
import { showLoadingScreen } from "../utils/uiUtils";
import { Veriff } from "@veriff/js-sdk"; // Import Veriff SDK
import StatusModal from "../components/StatusModal";

// Import images
import passportImage from "../images/passport.png";
import anmlImage from "../images/anml.png";
// Import ANML token image for the food serving context
import anmlCoinImage from "../images/anml.png";

const REGISTRATION_CONTRACT = contracts.registration.contract;
const REGISTRATION_HASH = contracts.registration.hash;

const ANMLClaim = ({ isKeplrConnected }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading"); // 'loading', 'success', 'error'

  // Select a food emoji based on the day of the week
  const [foodEmoji] = useState(() => {
    // Get current day of the week (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = new Date().getDay();

    // Food emojis grouped by days of the week
    const weekdayFoods = {
      // Sunday - Brunch day
      0: ["🥞", "🧇", "🥐", "🍳", "🥯", "🍉", "☕"],

      // Monday - Healthy start
      1: ["🥗", "🥑", "🍉", "🍓", "🥝", "🥥", "🥦"],

      // Tuesday - Taco Tuesday
      2: ["🌮", "🌯", "🫔", "🥙", "🌶️", "🍹", "🧀"],

      // Wednesday - Comfort food
      3: ["🍲", "🍜", "🥘", "🍛", "🍝", "🥪", "🍚"],

      // Thursday - International cuisine
      4: ["🍣", "🥟", "🫕", "🍱", "🥡", "🥘", "🍛"],

      // Friday - Party food
      5: ["🍕", "🍔", "🍟", "🍉", "🍻", "🍿", "🌭"],

      // Saturday - Dessert day
      6: ["🍦", "🧁", "🎂", "🍰", "🍪", "🍫", "🍮"],
    };

    // Get array for current day and pick a random emoji from it
    const todaysFoods = weekdayFoods[dayOfWeek];
    return todaysFoods[Math.floor(Math.random() * todaysFoods.length)];
  });

  // Function to check the verification status
  const checkVerificationStatus = async () => {
    console.log("Entering checkVerificationStatus");
    showLoadingScreen(true);

    let querymsg = {
      query_registration_status: {
        address: window.secretjs.address,
      },
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
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        if (data.pending) {
          anmlStatus = "pending";
        }
      } catch (error) {
        console.error("Error:", error);
      }
    }

    console.log("Anml Status:", anmlStatus);

    // Update UI based on the status
    document.querySelectorAll(".anml-test-box").forEach((box) => box.classList.add("remove"));
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
  };

  // Function to handle the register button click and start the Veriff verification
  const registerButton = () => {
    console.log("Register button clicked");

    try {
      const veriff = Veriff({
        apiKey: "0c926c59-8076-42a5-a7a3-80727c13e461", // Replace with your actual API key
        parentId: "anml-veriff-root", // The ID of the element where Veriff will be mounted
        onSession: function (err, response) {
          if (err) {
            console.error("Veriff session error:", err);
            return;
          }
          // Redirect to the verification URL
          window.location.href = response.verification.url;
        },
      });

      // Set the person and vendor data as per your original code
      veriff.setParams({
        person: {
          givenName: " ", // You can dynamically fetch and pass user data here
          lastName: " ",
        },
        vendorData: window.secretjs.address, // Replace with the actual address if necessary
      });

      veriff.mount(); // This initializes the Veriff flow in the specified parent element

      // Handle any class manipulations (e.g., hiding/showing certain elements)
      document.querySelector(".anml-test-box").classList.add("remove");
      document.querySelector("#disclaimer-box").classList.remove("remove");
    } catch (error) {
      console.error("Error initializing Veriff:", error);
    }
  };

  // Function to handle the claim button click
  const claimButton = async () => {
    setIsModalOpen(true); // Open the modal and show loading animation
    setAnimationState("loading"); // Set the state to loading when the swap starts

    let contractmsg = {
      claim_anml: {},
    };

    try {
      let tx = await contract(REGISTRATION_CONTRACT, REGISTRATION_HASH, contractmsg);
      if (tx.code === 0) {
        setAnimationState("success");
        document.querySelector("#claim-box").classList.add("remove");
        document.querySelector("#complete-box").classList.remove("remove");
      } else {
        setAnimationState("error");
        throw new Error(`Claim transaction failed with code ${tx.code}`);
      }
    } catch (error) {
      console.error("Error during claim:", error);
      setAnimationState("error");
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
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      <div id="register-box" className="anml-test-box remove">
        <img
          src={passportImage}
          width={350}
          alt="Logo"
          style={{ filter: "drop-shadow(25px 25px 25px #aaa)" }}
          className="logo-img"
        />
        <button onClick={registerButton} className="anml-claim-button">
          Register
        </button>
      </div>

      <div id="claim-box" className="anml-test-box remove">
        <img src={anmlImage} alt="Logo" className="logo-img" />
        <button onClick={claimButton} className="anml-claim-button">
          Claim
        </button>
      </div>

      <div className="anml-test-box remove" id="disclaimer-box">
        <i className="bx anml-bx-error-alt"></i>
        <span className="anml-disclaimer-text">
          <b>DISCLAIMER:</b> In order to secure proof of humanity, your currently connected wallet address will be
          associated with your identity.
        </span>
        <div id="anml-veriff-root"></div>
      </div>

      <div id="pending-box" className="anml-test-box remove">
        <i className="bx bx-hourglass status-icon"></i>
        <span className="anml-disclaimer-text">
          Your verification is now pending. Please allow up to 24 hours to verify. This page will be updated when
          complete
        </span>
      </div>

      <div id="complete-box" className="anml-test-box remove">
        <div className="horizon-container">
          <div className="food-item">{foodEmoji}</div>
          <div className="shadow-area"></div>
        </div>
        <span className="anml-success-text">CLAIMED! see you tomorrow!</span>
      </div>
    </>
  );
};

export default ANMLClaim;
