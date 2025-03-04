import React, { useState, useEffect } from "react";
import "./ImageInterpret.css";
import { showLoadingScreen } from "../utils/uiUtils";
import StatusModal from "../components/StatusModal";

const ImageInterpret = () => {
  const [file, setFile] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [jsonResponse, setJsonResponse] = useState(null);
  const [hasBlockchainError, setHasBlockchainError] = useState(false);

  useEffect(() => {
    showLoadingScreen(false);
  }, []);

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const validTypes = ["image/jpeg", "image/png"];
      if (!validTypes.includes(selectedFile.type)) {
        console.error("Invalid file type");
        return;
      }
      setFile(selectedFile);
      await handleUploadImage(selectedFile);
    }
  };

  const handleUploadImage = async (selectedFile) => {
    setIsModalOpen(true);
    setAnimationState("loading");
    setHasBlockchainError(false);

    const formData = new FormData();
    formData.append("image", selectedFile);

    try {
      const response = await fetch("http://localhost:3005/api/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log("Server response:", result);

      if (!result || typeof result !== "object" || !result.response) {
        setAnimationState("error");
      } else {
        setJsonResponse(result.response);
        // Check for blockchain error
        if (result.response.blockchain?.status === "error") {
          setHasBlockchainError(true);
        }
        setAnimationState("success");
        document.querySelector("#register-box").classList.add("remove");
        document.querySelector("#complete-box").classList.remove("remove");
      }
    } catch (error) {
      console.error("Error:", error);
      setAnimationState("error");
    } finally {
      setFile(null);
      const fileInput = document.querySelector(".image-file-input");
      if (fileInput) fileInput.value = "";
    }
  };

  return (
    <>
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      <div id="register-box" className="img-test-box">
        <img
          src="/images/passport.png"
          width={350}
          alt="Passport"
          style={{ filter: "drop-shadow(25px 25px 25px #aaa)" }}
          className="img-logo-img"
        />
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleFileChange}
          className="image-file-input"
          style={{ display: "none" }}
          id="file-input"
        />
        <button onClick={() => document.getElementById("file-input").click()} className="img-claim-button">
          Register
        </button>
      </div>

      <div id="complete-box" className="img-test-box remove">
        <img src="/images/anml.png" width={350} alt="ANML Token" className="img-logo-img" />
        <span className="img-success-text">
          {hasBlockchainError ? "Image processed but blockchain transaction failed" : "Image processed successfully!"}
        </span>
        {hasBlockchainError && <span className="img-error-text">Please try again later</span>}
        {jsonResponse && <pre className="img-json-response">{JSON.stringify(jsonResponse, null, 2)}</pre>}
      </div>
    </>
  );
};

export default ImageInterpret;
