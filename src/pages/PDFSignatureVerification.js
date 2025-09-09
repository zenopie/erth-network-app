import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import StatusModal from "../components/StatusModal";
import { showLoadingScreen } from "../utils/uiUtils";
import styles from "./PDFSignatureVerification.module.css";

const PDFSignatureVerification = ({ isKeplrConnected }) => {
  // Tab state
  const [activeTab, setActiveTab] = useState("sender");
  
  // Sender state
  const [pdfFile, setPdfFile] = useState(null);
  const [downloadLink, setDownloadLink] = useState(null);
  
  // Recipient state
  const [expectedAddress, setExpectedAddress] = useState("");
  const [zipFile, setZipFile] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState(""); // success, error, or empty
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  
  // Tooltip state
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const infoIconRef = useRef(null);
  

  // Remove loading screen on component mount
  useEffect(() => {
    showLoadingScreen(false);
  }, []);

  // Helper Functions
  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const calculateSHA256 = async (buffer) => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Sender: Create signed package
  const signAndCreatePackage = async () => {
    if (!pdfFile) {
      alert("Please select a PDF file.");
      return;
    }

    if (!isKeplrConnected) {
      alert("Please connect Keplr first.");
      return;
    }

    setIsModalOpen(true);
    setAnimationState("loading");

    try {
      const pdfBuffer = await readFileAsArrayBuffer(pdfFile);
      const pdfHash = await calculateSHA256(pdfBuffer);
      
      const chainId = "secret-4";
      await window.keplr.enable(chainId);
      const offlineSigner = window.keplr.getOfflineSigner(chainId);
      const accounts = await offlineSigner.getAccounts();
      const signerAddress = accounts[0].address;
      
      const signature = await window.keplr.signArbitrary(chainId, signerAddress, pdfHash);
      
      const signaturePackage = {
        signerAddress: signerAddress,
        signature: signature
      };
      
      // Use JSZip (assuming it's available globally from CDN in HTML)
      const JSZip = window.JSZip;
      if (!JSZip) {
        throw new Error("JSZip library not found. Please ensure it's loaded.");
      }

      const zip = new JSZip();
      zip.file(pdfFile.name, pdfFile);
      zip.file("signature.json", JSON.stringify(signaturePackage, null, 2));
      
      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const zipFileName = `${pdfFile.name.replace('.pdf', '')}_signed.zip`;
      
      const downloadUrl = URL.createObjectURL(zipBlob);
      setDownloadLink({ url: downloadUrl, filename: zipFileName });
      
      setAnimationState("success");
    } catch (error) {
      console.error("An error occurred during signing:", error);
      setAnimationState("error");
    } finally {
      showLoadingScreen(false);
    }
  };

  // Recipient: Verify package
  const verifyPackage = async () => {
    if (!expectedAddress.trim()) {
      alert("Please enter the sender's expected address.");
      return;
    }

    if (!zipFile) {
      alert("Please select the received .zip package.");
      return;
    }

    if (!isKeplrConnected) {
      alert("Please connect Keplr first to verify signatures.");
      return;
    }

    setIsModalOpen(true);
    setAnimationState("loading");
    setVerificationResult(null);

    try {
      const JSZip = window.JSZip;
      if (!JSZip) {
        throw new Error("JSZip library not found. Please ensure it's loaded.");
      }

      const zip = new JSZip();
      const contents = await zip.loadAsync(zipFile);
      
      const signatureFile = contents.file("signature.json");
      if (!signatureFile) throw new Error("Missing 'signature.json' in the zip archive.");
      
      const pdfFileName = Object.keys(contents.files).find(name => 
        name.toLowerCase().endsWith('.pdf') && !name.startsWith('__MACOSX')
      );
      if (!pdfFileName) throw new Error("No PDF file found inside the zip archive.");
      
      const pdfFileInZip = contents.file(pdfFileName);
      
      const signatureText = await signatureFile.async("string");
      const signaturePackage = JSON.parse(signatureText);
      const { signature, signerAddress: actualSignerAddress } = signaturePackage;

      const pdfBuffer = await pdfFileInZip.async("arraybuffer");
      const receivedPdfHash = await calculateSHA256(pdfBuffer);
      
      const chainId = "secret-4";
      
      const isValid = await window.keplr.verifyArbitrary(
        chainId,
        expectedAddress,
        receivedPdfHash,
        signature
      );

      if (isValid) {
        setVerificationStatus("success");
        setVerificationResult({
          isValid: true,
          pdfFileName,
          expectedAddress,
          actualSignerAddress
        });
      } else {
        setVerificationStatus("error");
        setVerificationResult({
          isValid: false,
          pdfFileName,
          expectedAddress,
          actualSignerAddress
        });
      }

      setAnimationState("success");
    } catch (error) {
      setVerificationStatus("error");
      setVerificationResult({
        isValid: false,
        error: error.message
      });
      setAnimationState("error");
    } finally {
      showLoadingScreen(false);
    }
  };

  // Tooltip handlers
  const handleMouseEnter = () => {
    if (infoIconRef.current) {
      const rect = infoIconRef.current.getBoundingClientRect();
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8
      });
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  if (!isKeplrConnected) {
    return <div className={styles.errorMessage}>Connect Keplr first</div>;
  }

  return (
    <div className={styles.container}>
      <StatusModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        animationState={animationState} 
      />

      <div className={styles.titleContainer}>
        <h2 className={styles.title}>
          PDF Signature Verification
          <div 
            className={styles.infoIcon}
            ref={infoIconRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <i className="bx bx-info-circle"></i>
          </div>
        </h2>
        <p className={styles.subtitle}>
          Create cryptographically signed PDF packages or verify authenticity and integrity
        </p>
      </div>

      {/* TABS */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "sender" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("sender")}
        >
          <i className="bx bx-edit" style={{ marginRight: '8px' }}></i>
          Sender
        </button>
        <button
          className={`${styles.tab} ${activeTab === "recipient" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("recipient")}
        >
          <i className="bx bx-shield-check" style={{ marginRight: '8px' }}></i>
          Recipient
        </button>
      </div>

      {/* TAB CONTENT */}
      <div className={styles.tabContent}>
        {activeTab === "sender" && (
          <div className={styles.tabPane}>
            <h3 className={styles.sectionTitle}>Create a Signed Package</h3>
            <p className={styles.sectionDescription}>
              Select a PDF to generate a signed .zip package. Share your Secret Network address with the recipient.
            </p>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Select PDF File</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files[0])}
                className={styles.fileInput}
              />
            </div>

            <button
              className={styles.primaryButton}
              onClick={signAndCreatePackage}
              disabled={!pdfFile}
            >
              <i className="bx bx-package" style={{ marginRight: '8px' }}></i>
              Create Signed Package
            </button>

            {downloadLink && (
              <div className={styles.downloadContainer}>
                <i className="bx bx-download" style={{ marginRight: '8px', color: '#4caf50' }}></i>
                <a
                  href={downloadLink.url}
                  download={downloadLink.filename}
                  className={styles.downloadLink}
                >
                  Download {downloadLink.filename}
                </a>
              </div>
            )}
          </div>
        )}

        {activeTab === "recipient" && (
          <div className={styles.tabPane}>
            <h3 className={styles.sectionTitle}>Verify a Signed Package</h3>
            <p className={styles.sectionDescription}>
              Upload the .zip file and provide the sender's expected address to verify the signature.
            </p>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Expected Sender Address</label>
              <input
                type="text"
                placeholder="secret1..."
                value={expectedAddress}
                onChange={(e) => setExpectedAddress(e.target.value)}
                className={styles.textInput}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Select Signed .zip Package</label>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setZipFile(e.target.files[0])}
                className={styles.fileInput}
              />
            </div>

            <button
              className={styles.primaryButton}
              onClick={verifyPackage}
              disabled={!expectedAddress.trim() || !zipFile}
            >
              <i className="bx bx-check-shield" style={{ marginRight: '8px' }}></i>
              Verify Signature
            </button>

            {verificationResult && (
              <div className={`${styles.verificationResult} ${styles[verificationStatus]}`}>
                {verificationResult.error ? (
                  <>
                    <strong>❌ Error during verification:</strong>
                    <p>{verificationResult.error}</p>
                  </>
                ) : verificationResult.isValid ? (
                  <>
                    <strong>✅ VERIFICATION SUCCESSFUL</strong>
                    <p>
                      This confirms that the document (<code>{verificationResult.pdfFileName}</code>) 
                      was signed by the expected address:
                    </p>
                    <code>{verificationResult.expectedAddress}</code>
                  </>
                ) : (
                  <>
                    {verificationResult.expectedAddress === verificationResult.actualSignerAddress ? (
                      <>
                        <strong>❌ DOCUMENT INTEGRITY COMPROMISED</strong>
                        <p>The signature is from the expected address (<code>{verificationResult.expectedAddress}</code>), 
                        but the document content has been <strong>altered since signing</strong>.</p>
                        <p>Document: <code>{verificationResult.pdfFileName}</code></p>
                        <hr />
                        <p>This means the PDF content was modified after the signature was created, compromising its integrity.</p>
                      </>
                    ) : (
                      <>
                        <strong>❌ WRONG SIGNER</strong>
                        <p>This document was signed by a different address than expected.</p>
                        <p><strong>Expected:</strong> <code>{verificationResult.expectedAddress}</code></p>
                        <p><strong>Actual Signer:</strong> <code>{verificationResult.actualSignerAddress}</code></p>
                        <hr />
                        <p>The document was signed by someone else, not the person you expected.</p>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Portal tooltip outside container */}
      {showTooltip && createPortal(
        <div 
          className={styles.portalTooltip}
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: 'translateX(-50%)'
          }}
        >
          This tool verifies two things: <strong>(1)</strong> the document was signed by the expected address, 
          and <strong>(2)</strong> the document content hasn't been altered since signing.
        </div>,
        document.body
      )}
    </div>
  );
};

export default PDFSignatureVerification;