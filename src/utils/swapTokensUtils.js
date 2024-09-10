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

    // Ensure the reserves are valid numbers
    if (!toReserve || !fromReserve || isNaN(toReserve) || isNaN(fromReserve)) {
        console.error('Invalid reserves in calculateInput:', { toReserve, fromReserve });
        return '';
    }

    // Convert output amount to micro units
    const outputMicro = toMicroUnits(parseFloat(outputAmount), toToken);

    // Check if the outputMicro exceeds the available liquidity in the `toReserve`
    if (outputMicro >= toReserve) {
        console.error('Insufficient liquidity: outputMicro exceeds toReserve');
        return '';
    }

    // Reverse the constant product formula to solve for input amount
    // inputAmount = ((toReserve * outputMicro) / (toReserve - outputMicro)) - fromReserve
    const numerator = fromReserve * outputMicro;
    const denominator = toReserve - outputMicro;
    const inputMicroWithoutFee = Math.ceil(numerator / denominator);  // Ceil to ensure rounding up

    // Apply the protocol fee to get the actual input amount
    const protocolFeeAmount = Math.ceil(inputMicroWithoutFee * (fees.protocol / 10000));
    const totalInputMicro = inputMicroWithoutFee + protocolFeeAmount;

    // Return input amount in macro units
    return toMacroUnits(totalInputMicro, fromToken).toString();
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