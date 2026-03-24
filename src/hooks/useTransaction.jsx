import { useState, useCallback } from "react";
import { useLoading } from "../contexts/LoadingContext";

const useTransaction = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const { suppressLoading } = useLoading();

  const execute = useCallback(async (fn) => {
    setIsModalOpen(true);
    setAnimationState("loading");
    suppressLoading(true);
    try {
      await fn();
      setAnimationState("success");
    } catch (err) {
      console.error("Transaction error:", err);
      setAnimationState("error");
    }
  }, [suppressLoading]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    // Delay un-suppress so any data refresh triggered by the callback
    // has time to finish without flashing the loading overlay
    setTimeout(() => suppressLoading(false), 500);
  }, [suppressLoading]);

  return { isModalOpen, animationState, execute, closeModal };
};

export default useTransaction;
