import React, { createContext, useContext, useState, useCallback } from "react";

const LoadingContext = createContext(null);

export const useLoading = () => {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error("useLoading must be used within LoadingProvider");
  return ctx;
};

export const LoadingProvider = ({ children }) => {
  const [loadingCount, setLoadingCount] = useState(0);
  const [suppressed, setSuppressed] = useState(false);

  const showLoading = useCallback(() => setLoadingCount(c => c + 1), []);
  const hideLoading = useCallback(() => setLoadingCount(c => Math.max(0, c - 1)), []);
  const suppressLoading = useCallback((val) => setSuppressed(val), []);

  const isLoading = loadingCount > 0 && !suppressed;

  return (
    <LoadingContext.Provider value={{ isLoading, showLoading, hideLoading, suppressLoading }}>
      {children}
    </LoadingContext.Provider>
  );
};

export default LoadingContext;
