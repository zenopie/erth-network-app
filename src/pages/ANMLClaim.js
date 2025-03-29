import React, { useState, useEffect } from "react";
import "./ANMLClaim.css";
import contracts from "../utils/contracts";
import { query, contract } from "../utils/contractUtils";
import { showLoadingScreen } from "../utils/uiUtils";
import StatusModal from "../components/StatusModal";
import passportImage from "../images/passport.png";
import anmlImage from "../images/anml.png";

const REGISTRATION_CONTRACT = contracts.registration.contract;
const REGISTRATION_HASH = contracts.registration.hash;

const ANMLClaim = ({ isKeplrConnected }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [idImage, setIdImage] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const [foodEmoji] = useState(() => {
    const dayOfWeek = new Date().getDay();
    const weekdayFoods = {
      0: ["🥞", "🧇", "🥐", "🍳", "🥯", "🍉", "☕"],
      1: ["🥗", "🥑", "🍉", "🍓", "🥝", "🥥", "🥦"],
      2: ["🌮", "🌯", "🫔", "🥙", "🌶️", "🍹", "🧀"],
      3: ["🍲", "🍜", "🥘", "🍛", "🍝", "🥪", "🍚"],
      4: ["🍣", "🥟", "🫕", "🍱", "🥡", "🥘", "🍛"],
      5: ["🍕", "🍔", "🍟", "🍉", "🍻", "🍿", "🌭"],
      6: ["🍦", "🧁", "🎂", "🍰", "🍪", "🍫", "🍮"],
    };
    const todaysFoods = weekdayFoods[dayOfWeek];
    return todaysFoods[Math.floor(Math.random() * todaysFoods.length)];
  });

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
      const oneDayInMillis = 24 * 60 * 60 * 1000;
      let nextClaim = contractValue.last_claim / 1000000 + oneDayInMillis;
      anmlStatus = now > nextClaim ? "claimable" : "claimed";
    }

    console.log("Anml Status:", anmlStatus);
    document.querySelectorAll(".anml-test-box").forEach((box) => box.classList.add("remove"));
    if (anmlStatus === "claimable") {
      document.querySelector("#claim-box").classList.remove("remove");
    } else if (anmlStatus === "claimed") {
      document.querySelector("#complete-box").classList.remove("remove");
    } else if (anmlStatus === "not_verified") {
      document.querySelector("#register-box").classList.remove("remove");
    }
    showLoadingScreen(false);
    console.log("Exiting checkVerificationStatus");
  };

  const handleFileUpload = (event, setImage) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(",")[1]; // Strip prefix
        setImage(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const registerButton = async () => {
    if (!idImage) {
      alert("Please upload an ID image");
      return;
    }

    setIsRegistering(true);
    setIsModalOpen(true);
    setAnimationState("loading");

    console.log("ID Image size:", idImage.length / 1024 / 1024, "MB");

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: window.secretjs.address,
          idImage,
        }),
      });

      const data = await response.json();
      console.log("Registration response:", data);
      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      setAnimationState("success");
      setTimeout(() => {
        setIsModalOpen(false);
        checkVerificationStatus();
      }, 2000);
    } catch (error) {
      console.error("Registration error:", error);
      setAnimationState("error");
      setTimeout(() => setIsModalOpen(false), 2000);
    } finally {
      setIsRegistering(false);
    }
  };

  const claimButton = async () => {
    setIsModalOpen(true);
    setAnimationState("loading");

    let contractmsg = { claim_anml: {} };
    try {
      let tx = await contract(REGISTRATION_CONTRACT, REGISTRATION_HASH, contractmsg);
      if (tx.code === 0) {
        setAnimationState("success");
        document.querySelector("#claim-box").classList.add("remove");
        document.querySelector("#complete-box").classList.remove("remove");
      } else {
        throw new Error(`Claim transaction failed with code ${tx.code}`);
      }
    } catch (error) {
      console.error("Error during claim:", error);
      setAnimationState("error");
    }
  };

  useEffect(() => {
    if (isKeplrConnected) {
      checkVerificationStatus();
    }
  }, [isKeplrConnected]);

  return (
    <>
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      <div id="register-box" className="anml-test-box remove">
        <img
          src={passportImage}
          width={350}
          alt="Logo"
          style={{ filter: "drop-shadow(25px 25px 25px #aaa)" }}
          className="logo-img"
        />
        <div style={{ margin: "20px 0" }}>
          <label>
            Upload ID:
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFileUpload(e, setIdImage)}
              disabled={isRegistering}
            />
          </label>
        </div>
        <button
          onClick={registerButton}
          className="anml-claim-button"
          disabled={!idImage || isRegistering}
        >
          {isRegistering ? "Registering..." : "Register"}
        </button>
      </div>

      <div id="claim-box" className="anml-test-box remove">
        <img src={anmlImage} alt="Logo" className="logo-img" />
        <button onClick={claimButton} className="anml-claim-button">
          Claim
        </button>
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