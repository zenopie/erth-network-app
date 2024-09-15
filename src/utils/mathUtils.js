export const toMacroUnits = (amount, token) => {
    // Check if amount is a valid number (even 0 is valid) (JS considers 0 a false) 
    if (amount === null || amount === undefined || isNaN(amount) || !token || typeof token.decimals !== 'number') {
        console.warn('Invalid parameters for toMacroUnits:', { amount, token });
        return NaN;
    }

    // Convert to macro units
    const macroUnits = amount / Math.pow(10, token.decimals);

    // Ensure we're returning a valid float with the correct number of decimals
    return parseFloat(macroUnits.toFixed(token.decimals));
};







export const toMicroUnits = (amount, token) => {
    if (amount === null || amount === undefined || isNaN(amount) || !token || typeof token.decimals !== 'number') {
        console.warn('Invalid parameters for toMicroUnits:', { amount, token });
        return NaN;
    }
    return Math.floor(parseFloat(amount) * Math.pow(10, token.decimals));
};
