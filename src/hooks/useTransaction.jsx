import { useState, useCallback } from "react";
import { useLoading } from "../contexts/LoadingContext";
import { TxStatusUnknownError } from "../chain/tx";

const useTransaction = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  // What went wrong, for the modal to show. The error used to go to the
  // console only, so a rejected or failed transaction was a red cross with no
  // reason — indistinguishable from a wallet popup being dismissed.
  const [error, setError] = useState(null);
  // Set when the tx was sent but its outcome could not be read: the modal
  // says "submitted, status unknown" and links the hash, never "failed".
  const [txHash, setTxHash] = useState(null);
  const { suppressLoading } = useLoading();

  const execute = useCallback(async (fn) => {
    setIsModalOpen(true);
    setAnimationState("loading");
    setError(null);
    setTxHash(null);
    suppressLoading(true);
    try {
      await fn();
      setAnimationState("success");
    } catch (err) {
      console.error("Transaction error:", err);
      setError(err?.message || String(err));
      if (err instanceof TxStatusUnknownError) {
        setTxHash(err.hash);
        setAnimationState("unknown");
      } else {
        setAnimationState("error");
      }
    }
  }, [suppressLoading]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    // Delay un-suppress so any data refresh triggered by the callback
    // has time to finish without flashing the loading overlay
    setTimeout(() => suppressLoading(false), 500);
  }, [suppressLoading]);

  return { isModalOpen, animationState, error, txHash, execute, closeModal };
};

export default useTransaction;
