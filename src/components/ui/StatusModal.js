import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import "./StatusModal.css";

/**
 * Reusable modal component for displaying loading, success, or error states
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to call when modal is closed
 * @param {string} props.animationState - Current animation state ('loading', 'success', or 'error')
 */
const StatusModal = ({ isOpen, onClose, animationState }) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (animationState === "success" || animationState === "error") {
      setIsLoading(false);

      const timer = setTimeout(() => {
        onClose();
      }, 1500);

      return () => clearTimeout(timer);
    } else if (animationState === "loading") {
      setIsLoading(true);
    }
  }, [animationState, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal">
        <div className="modal-content">
          {isLoading && animationState === "loading" && (
            <div className="loading-spinner">
              <div className="lds-ripple">
                <div></div>
                <div></div>
              </div>
            </div>
          )}

          {!isLoading && animationState === "success" && (
            <div className="checkmark-wrapper">
              <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
                <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>
          )}

          {!isLoading && animationState === "error" && <div className="error-crossmark"></div>}
        </div>
      </div>
    </>
  );
};

StatusModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  animationState: PropTypes.oneOf(["loading", "success", "error"]).isRequired,
};

export default StatusModal;
