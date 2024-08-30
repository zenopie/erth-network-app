export const toMacroUnits = (amount, token) => {
    if (!amount || isNaN(amount) || !token || !token.decimals) {
        console.warn('Invalid parameters for toMacroUnits:', { amount, token });
        return NaN;
    }

    const macroUnits = (parseFloat(amount) / Math.pow(10, token.decimals)).toFixed(token.decimals);
    return parseFloat(macroUnits);  // Remove trailing zeros
};




export const toMicroUnits = (amount, token) => {
    if (!amount || isNaN(amount) || !token || !token.decimals) {
        console.warn('Invalid parameters for toMicroUnits:', { amount, token });
        return NaN;
    }
    return Math.floor(parseFloat(amount) * Math.pow(10, token.decimals));
};
