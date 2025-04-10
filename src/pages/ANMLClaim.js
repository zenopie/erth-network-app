import React, { useState, useEffect, useRef } from "react";
import "./ANMLClaim.css";
import contracts from "../utils/contracts";
import { query, contract } from "../utils/contractUtils";
import { showLoadingScreen } from "../utils/uiUtils";
import StatusModal from "../components/StatusModal";
import passportImage from "../images/passport.png";
import anmlImage from "../images/anml.png";

const REGISTRATION_CONTRACT = contracts.registration.contract;
const REGISTRATION_HASH = contracts.registration.hash;

// Bech32 validation for Secret Network addresses
const isValidSecretAddress = (address) => {
  if (!address) return true; // Empty is valid since it's optional
  const secretAddressRegex = /^secret1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/;
  return typeof address === 'string' && secretAddressRegex.test(address);
};

const ANMLClaim = ({ isKeplrConnected }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [idImage, setIdImage] = useState(null);
  const [selfieImage, setSelfieImage] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [referredBy, setReferredBy] = useState("");
  const [isReferredByValid, setIsReferredByValid] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const idInputRef = useRef(null);

  const [foodEmoji] = useState(() => {
    const dayOfWeek = new Date().getDay();
    const weekdayFoods = {
      0: ["🥞", "🧇", "🥐", "🍳", "🥯", "🍉", "☕"],
      1: ["🥗", "🥑", "🍉", "🍓", "🥝", "🥥", "🥦"],
      2: ["🌮", "🌯", "🫔", "🥙", "🌶️", "🍹", "🧀"],
      3: ["🍲", "🍜", "🍝", "🍛", "🥪", "🍚"],
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

  const startCamera = async () => {
    try {
      console.log("Requesting camera access");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" } 
      });
      console.log("Got stream", stream);
      setStream(stream);
      setIsCameraActive(true);
      setCameraError(null);
    } catch (error) {
      console.error("Camera access error:", error);
      setCameraError("Failed to access camera. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      console.log("Stopping stream");
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  const captureSelfie = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      const base64Image = canvasRef.current.toDataURL('image/jpeg').split(',')[1];
      setSelfieImage(base64Image);
      stopCamera();
    }
  };

  const handleIdUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(",")[1];
        setIdImage(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleIdClick = () => {
    if (!isRegistering && idInputRef.current) {
      idInputRef.current.click();
    }
  };

  const handleSelfieClick = () => {
    if (!isRegistering) {
      console.log("Starting camera");
      startCamera();
    }
  };

  const handleReferredByChange = (e) => {
    const address = e.target.value;
    setReferredBy(address);
    setIsReferredByValid(isValidSecretAddress(address));
  };

  const registerButton = async () => {
    if (!idImage) return; // Only require idImage for now
    if (referredBy && !isReferredByValid) return;

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
          idImage, // Only sending idImage as per server
          referredBy: referredBy || null,
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
    return () => stopCamera();
  }, [isKeplrConnected]);

  useEffect(() => {
    if (isCameraActive && stream && videoRef.current) {
      console.log("Setting stream to video element");
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (stream) {
        console.log("Stopping stream in cleanup");
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraActive, stream]);

  return (
    <>
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      <div id="register-box" className="anml-test-box remove">
        <img
          src={passportImage}
          width={350}
          alt="Passport"
          style={{ filter: "drop-shadow(25px 25px 25px #aaa)" }}
          className="logo-img"
        />
        <div className="anml-upload-container">
          <div className="anml-upload-button-group">
            <button
              onClick={handleIdClick}
              className="anml-upload-button"
              disabled={isRegistering}
            >
              {idImage ? "✔" : "+"}
            </button>
            <input
              type="file"
              accept="image/*"
              onChange={handleIdUpload}
              disabled={isRegistering}
              ref={idInputRef}
              style={{ display: 'none' }}
            />
            <span className="anml-upload-label">Upload ID</span>
          </div>
          <div className="anml-upload-button-group">
            <button
              onClick={handleSelfieClick}
              className="anml-upload-button"
              disabled={isRegistering}
            >
              {selfieImage ? "✔" : "+"}
            </button>
            <span className="anml-upload-label">Take Selfie</span>
          </div>
        </div>

        {cameraError && (
          <div className="anml-validation-error">{cameraError}</div>
        )}

        <div className="anml-input-container">
          <label className="anml-input-label">
            Referred by (optional):
            <div className="anml-validation-container">
              <input
                type="text"
                value={referredBy}
                onChange={handleReferredByChange}
                placeholder="secret1..."
                disabled={isRegistering}
                className="anml-input-field"
              />
              {referredBy && isReferredByValid === true && (
                <span className="anml-validation-check">✓</span>
              )}
            </div>
            {referredBy && isReferredByValid === false && (
              <div className="anml-validation-error">✗ Not valid</div>
            )}
          </label>
        </div>

        <button
          onClick={registerButton}
          className="anml-claim-button"
          disabled={!idImage || isRegistering} // Only idImage required for registration
        >
          {isRegistering ? "Registering..." : "Register"}
        </button>

        {isCameraActive && (
          <div className="anml-modal-overlay">
            <div className="anml-modal-content">
              <video 
                className="anml-video-preview" 
                ref={videoRef} 
                autoPlay 
                playsInline 
              />
              <div className="anml-modal-buttons">
                <button 
                  onClick={captureSelfie} 
                  className="anml-claim-button anml-capture-button"
                >
                  Capture
                </button>
                <button 
                  onClick={stopCamera} 
                  className="anml-claim-button anml-cancel-button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div id="claim-box" className="anml-test-box remove">
        <img src={anmlImage} alt="ANML" className="logo-img" />
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

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </>
  );
};

export default ANMLClaim;