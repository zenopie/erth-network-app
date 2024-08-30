import tokens from "./tokens.js"
import { toMacroUnits, toMicroUnits } from "./mathUtils.js";
// swapUtils.js
export const calculateOutput = (inputAmount, fromToken, toToken, reserves, fees) => {
    // Use the contract addresses to access the reserves
    const fromReserve = reserves[fromToken.contract];
    const toReserve = reserves[toToken.contract];
    
    if (!fromReserve || !toReserve) {
        console.error('Missing reserve information:', { fromReserve, toReserve });
        return NaN;
    }

    const inputMicro = toMicroUnits(parseFloat(inputAmount), fromToken); // Convert inputAmount to a float for calculation

    const protocolFeeAmount = inputMicro * (fees.protocol / 10000);

    const amountAfterProtocolFee = inputMicro - protocolFeeAmount;

    const outputMicro = (amountAfterProtocolFee * toReserve) / (fromReserve + amountAfterProtocolFee);

    if (outputMicro > toReserve) {
        return "";
    }

    return toMacroUnits(outputMicro, toToken);  // Convert outputMicro back to a more readable unit
};


export const calculateInput = (outputAmount, toToken, fromToken, reserves, fees) => {
    const toReserve = reserves[toToken.contract];
    const fromReserve = reserves[fromToken.contract];

    if (!toReserve || !fromReserve || isNaN(toReserve) || isNaN(fromReserve)) {
        console.error('Invalid reserves in calculateInput:', { toReserve, fromReserve });
        return '';
    }

    const outputMicro = toMicroUnits(parseFloat(outputAmount), toToken);

    // Check if outputMicro is greater than toReserve
    if (outputMicro >= toReserve) {
        console.error('Insufficient liquidity: outputMicro exceeds toReserve');
        return '';
    }

    const inputMicro = (outputMicro * (fromReserve + outputMicro)) / (toReserve - outputMicro);

    // Apply protocol fee
    const protocolFeeAmount = inputMicro * (fees.protocol / 10000);
    const totalInput = inputMicro + protocolFeeAmount;


    if (isNaN(totalInput) || totalInput < 0) {
        console.error('Invalid totalInput:', totalInput);
        return '';
    }

    // Convert to macro units and return as a string
    return toMacroUnits(totalInput, fromToken).toString();
};






export const calculateMinimumReceived = (outputAmount, slippage) => {
    const slippageMultiplier = (100 - slippage) / 100;
    return outputAmount * slippageMultiplier;
};

export const getPoolDetails = (tokenA, tokenB) => {
    if (tokenA === 'ERTH' && tokenB === 'ERTH') {
        console.error('Both tokens cannot be ERTH.');
        return null;
    }

    if (tokenA === 'ERTH') {
        return tokens[tokenB];
    } else if (tokenB === 'ERTH') {
        return tokens[tokenA];
    }

    console.error('Invalid token pair:', tokenA, tokenB);
    return null;
};


export default tokens;