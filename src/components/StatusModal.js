import React, { useEffect, useState } from "react";
import "./StatusModal.css"; // Include your CSS for animations

const ReusableModal = ({ isOpen, onClose, animationState }) => {
  const [isLoading, setIsLoading] = useState(true);

  // Use effect to handle when the animationState changes
  useEffect(() => {
    if (animationState === "success" || animationState === "error") {
      setIsLoading(false); // Stop loading when success or error occurs

      // Set a timeout to close
      const timer = setTimeout(() => {
        onClose(); // Automatically close the modal
      }, 1500); // Adjust the duration as needed

      // Cleanup the timer if the component unmounts before the timeout completes
      return () => clearTimeout(timer);
    } else if (animationState === "loading") {
      setIsLoading(true); // Set loading back to true when a new action starts
    }
  }, [animationState, onClose]);

  return (
    isOpen && (
      <>
        {/* Full-screen grey background overlay */}
        <div className="status-modal-overlay" onClick={onClose}></div>

        {/* Modal Content */}
        <div className="modal">
          <div className="status-modal-content">
            {isLoading && animationState === "loading" && (
              <div className="lds-ripple">
                <div></div>
                <div></div>
              </div> /* Ripple animation */
            )}

            {!isLoading && animationState === "success" && (
              <div className="status-modal-checkmark-wrapper">
                <svg className="status-modal-checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                  <circle className="status-modal-checkmark__circle" cx="26" cy="26" r="25" fill="none" />
                  <path className="status-modal-checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                </svg>
              </div>
            )}

            {!isLoading && animationState === "error" && (
              <div className="status-modal-error-crossmark"></div> /* Error crossmark */
            )}
          </div>
        </div>
      </>
    )
  );
};

export default ReusableModal;
