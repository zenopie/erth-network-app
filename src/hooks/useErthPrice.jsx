import { useState, useEffect } from "react";
import { fetchErthPrice } from "../utils/apiUtils";

const useErthPrice = (updateInterval = 60000) => {
  const [erthPrice, setErthPrice] = useState(null);

  useEffect(() => {
    const update = async () => {
      try {
        const data = await fetchErthPrice();
        setErthPrice(data.price);
      } catch (e) {
        console.error("Failed to fetch ERTH price:", e);
      }
    };
    update();
    const id = setInterval(update, updateInterval);
    return () => clearInterval(id);
  }, [updateInterval]);

  return erthPrice;
};

export default useErthPrice;
