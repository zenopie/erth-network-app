import { useState, useCallback } from "react";
import { useLoading } from "../contexts/LoadingContext";

const useTransaction = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  // What went wrong, for the modal to show. The error used to go to the
  // console only, so a rejected or failed transaction was a red cross with no
  // reason — indistinguishable from a wallet popup being dismissed.
  const [error, setError] = useState(null);
  const { suppressLoading } = useLoading();

  const execute = useCallback(async (fn) => {
    setIsModalOpen(true);
    setAnimationState("loading");
    setError(null);
    suppressLoading(true);
    try {
      await fn();
      setAnimationState("success");
    } catch (err) {
      console.error("Transaction error:", err);
      setError(err?.message || String(err));
      setAnimationState("error");
    }
  }, [suppressLoading]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    // Delay un-suppress so any data refresh triggered by the callback
    // has time to finish without flashing the loading overlay
    setTimeout(() => suppressLoading(false), 500);
  }, [suppressLoading]);

  return { isModalOpen, animationState, error, execute, closeModal };
};

export default useTransaction;
