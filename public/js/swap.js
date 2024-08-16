let reserves = {}; // Define reserves globally

async function start() {
    console.log("starting swap.js");

    let fromToken = document.getElementById('from-token').value;
    let toToken = document.getElementById('to-token').value;

    const selectedToken = fromToken === 'ERTH' ? toToken : fromToken;
    const poolContractAddress = pool_contracts[selectedToken];
    const poolHash = pool_hashes[selectedToken];

    if (!poolContractAddress || !poolHash) {
        console.error("No contract address or hash found for the selected token.");
        return;
    }

    const stateInfo = await query(poolContractAddress, poolHash);

    reserves = {
        ERTH: parseInt(stateInfo.token_erth_reserve),
        [selectedToken]: parseInt(stateInfo.token_b_reserve),
    };

    fees = {
        protocol: parseInt(stateInfo.protocol_fee),
    };

    showLoadingScreen(false);
}


// Function to query the state from the contract
async function query(contractAddress, contractHash) {
    let stateInfo = await secretjs.query.compute.queryContract({
        contract_address: contractAddress,  // Use the dynamic contract address
        code_hash: contractHash,  // Use the dynamic code hash
        query: {
            query_state: {}
        }
    });

    // Return the state data
    return stateInfo.state; // Assuming the actual state is under 'state' key
}


async function swapButton() {
    try {
        // Get the selected tokens and amount
        const fromToken = document.getElementById('from-token').value;
        const toToken = document.getElementById('to-token').value;
        const inputAmount = parseFloat(document.getElementById('from-amount').value);
        const slippage = parseFloat(document.getElementById('slippage-input').value);
        
        // Validate input amount
        if (isNaN(inputAmount) || inputAmount <= 0) {
            alert('Invalid amount entered.');
            return;
        }

        // Get the correct contract address and hash
        const selectedToken = fromToken === 'ERTH' ? toToken : fromToken;
        const pool_contract = pool_contracts[selectedToken];
        const pool_hash = pool_hashes[selectedToken];

        // Validate contract and hash existence
        if (!pool_contract || !pool_hash) {
            alert('Contract or hash not found for the selected token.');
            return;
        }
        
        // Calculate the output amount and minimum received
        const outputAmount = calculateOutput(inputAmount, fromToken, toToken);
        if (outputAmount === "Insufficient liquidity") {
            alert('Insufficient liquidity.');
            return;
        }
        
        const minReceived = calculateMinimumReceived(outputAmount, slippage, toToken);

        // Convert input amount and minimum received to micro units
        const inputAmountInMicroUnits = toMicroUnits(inputAmount, fromToken);
        const minReceivedInMicroUnits = toMicroUnits(minReceived, toToken);

        // Prepare snip message
        const snipmsg = {
            swap: {
                min_received: minReceivedInMicroUnits.toString(),
            }
        };
        // Call the snip function
        await snip(tokens[fromToken].contract, tokens[fromToken].hash, pool_contract, pool_hash, snipmsg, inputAmountInMicroUnits);
        
        // Display success message
        document.getElementById('swap-result').textContent = "Swap executed successfully!";
    } catch (error) {
        console.error('Error executing swap:', error);
        document.getElementById('swap-result').textContent = "Error executing swap. Check the console for details.";
    }
}




// Utility function to convert macro units to micro units
function toMicroUnits(amount, token) {
    return Math.floor(amount * Math.pow(10, decimals[token]));
}

// Utility function to convert micro units to macro units
function toMacroUnits(amount, token) {
    return amount / Math.pow(10, decimals[token]);
}

// Utility function to calculate output based on input amount
function calculateOutput(inputAmount, fromToken, toToken) {
    const fromReserve = reserves[fromToken];
    const toReserve = reserves[toToken];
    const inputMicro = toMicroUnits(inputAmount, fromToken);

    // Calculate protocol fee and subtract it from the input amount
    const protocolFeeAmount = inputMicro * (fees.protocol / 10000);
    const amountAfterProtocolFee = inputMicro - protocolFeeAmount;

    // Calculate the output amount using the constant product formula
    const outputMicro = (amountAfterProtocolFee * toReserve) / (fromReserve + amountAfterProtocolFee);

    // Check if output exceeds available liquidity
    if (outputMicro > toReserve) {
        return "Insufficient liquidity";
    }

    return toMacroUnits(outputMicro, toToken);
}

// Utility function to calculate input based on desired output amount
function calculateInput(outputAmount, fromToken, toToken) {
    const fromReserve = reserves[fromToken];
    const toReserve = reserves[toToken];
    const outputMicro = toMicroUnits(outputAmount, toToken);

    // Calculate the input amount using the reverse of the constant product formula
    const numerator = outputMicro * (fromReserve + outputMicro);
    const denominator = toReserve - outputMicro;
    const inputMicro = numerator / denominator;

    // Calculate protocol fee
    const protocolFeeAmount = inputMicro * (fees.protocol / 10000);
    const inputMicroWithFees = inputMicro + protocolFeeAmount;

    if (outputMicro > toReserve) {
        return "Insufficient liquidity";
    }

    return toMacroUnits(inputMicroWithFees, fromToken);
}

// Utility function to calculate price impact
function calculatePriceImpact(inputAmount, outputAmount, fromToken, toToken) {
    const initialPrice = reserves[fromToken] / reserves[toToken];
    const inputMicro = toMicroUnits(inputAmount, fromToken);
    const outputMicro = toMicroUnits(outputAmount, toToken);
    const newPrice = (reserves[fromToken] + inputMicro) / (reserves[toToken] - outputMicro);
    const priceImpact = ((newPrice - initialPrice) / initialPrice) * 100;
    
    return priceImpact;
}

// Utility function to calculate trade fee (protocol fee only)
function calculateTradeFee(amount, token) {
    const amountMicro = toMicroUnits(amount, token);
    const protocolFee = (amountMicro * fees.protocol) / 10000;
    return toMacroUnits(protocolFee, token);
}

// Utility function to calculate minimum received
function calculateMinimumReceived(outputAmount, slippage, toToken) {
    const slippageMultiplier = (100 - slippage) / 100;
    const minReceived = outputAmount * slippageMultiplier;
    return minReceived;
}

function validateInputDecimals(inputElement, token) {
    const maxDecimals = decimals[token];

    console.log(inputElement.value);
    
    // Allow empty input, 0, or just a decimal point
    if (inputElement.value === "" || inputElement.value === "0" || inputElement.value === "0." || inputElement.value === ".") {
        return; // These are valid initial inputs
    }

    // Regex to allow numbers with optional leading zero and optional decimals
    const regex = new RegExp(`^0?\\d*(\\.\\d{0,${maxDecimals}})?$`);
    
    if (regex.test(inputElement.value)) {
        return; // Input is valid
    }

    // If invalid, slice off the last character
    console.log("test");
    inputElement.value = inputElement.value.slice(0, -1);
}


function handleSwapCalculationFromInput() {
    const inputElement = document.getElementById('from-amount');
    const fromToken = document.getElementById('from-token').value;

    // Get the current input value as a string
    let inputValue = inputElement.value;
    console.log("Initial Input Value:", inputValue);

    // Remove leading zeros if there's no decimal point
    if (inputValue.match(/^0[1-9]+$/)) {
        console.log("Detected leading zeros, removing them.");
        inputValue = inputValue.replace(/^0+/, '');
        inputElement.value = inputValue;
    }

    // Handle the specific case for "0."
    if (inputValue === "0.") {
        console.log("Detected input '0.'");
        inputElement.value = inputValue; // Display "0."
        return; // Stop further processing to avoid premature parsing
    }

    // Handle the case for "." by converting it to "0."
    if (inputValue === ".") {
        console.log("Detected input '.' and converting to '0.'");
        inputElement.value = "0."; // Convert "." to "0."
        return; // Stop further processing
    }

    // Handle the case for "0" (but not "0." or "0.0")
    if (inputValue === "0") {
        console.log("Detected input '0'");
        inputElement.value = inputValue; // Display "0"
        return; // Stop further processing to avoid premature parsing
    }

    // Handle the case for "0." or "0.0" or any number of zeros after the decimal
    if (inputValue.match(/^0\.\d*$/)) {
        console.log("Detected input '0.' followed by digits or zeros:", inputValue);
        // Allow input to be displayed but not proceed with calculations yet
        if (inputValue.match(/^0\.\d+$/)) {
            console.log("Valid decimal input detected, proceeding with calculations.");
        } else {
            // If it's still a partial input like "0." or "0.0", stop here
            return;
        }
    }

    // Get the allowed decimal places for the token
    const decimalPlaces = decimals[fromToken] || 6; // Default to 6 if undefined

    // Trim the input value to the correct number of decimal places
    const [wholePart, decimalPart] = inputValue.split('.');
    if (decimalPart && decimalPart.length > decimalPlaces) {
        console.log(`Trimming input to ${decimalPlaces} decimal places.`);
        inputValue = `${wholePart}.${decimalPart.substring(0, decimalPlaces)}`;
        inputElement.value = inputValue;
    }

    // Validate the input for decimals, ensuring it doesn't exceed the allowed decimals
    validateInputDecimals(inputElement, fromToken);
    console.log("After Validation - Input Value:", inputElement.value);

    // Convert input to a float only if it's a valid number
    const inputAmount = parseFloat(inputValue);
    console.log("Parsed Input Amount:", inputAmount);

    // Ensure that "0." or "." is not prematurely processed
    if (isNaN(inputAmount)) {
        console.log("NaN Detected - Exiting function");
        return;
    }

    // If input is exactly 0 (and not "0."), skip unnecessary calculations
    if (inputAmount === 0 && inputValue !== "0." && !inputValue.startsWith("0.")) {
        console.log("Input is 0, displaying '0' and stopping further calculations.");
        inputElement.value = "0";
        return;
    }

    console.log("Valid Input Detected - Proceeding with calculations");

    // Proceed with swap calculations
    const toToken = document.getElementById('to-token').value;
    const outputAmount = calculateOutput(inputAmount, fromToken, toToken);
    console.log("Calculated Output Amount:", outputAmount);

    // Check for insufficient liquidity
    if (outputAmount === "Insufficient liquidity") {
        console.log("Insufficient Liquidity Detected");
        document.getElementById('to-amount').placeholder = "Insufficient liquidity";
        clearOutputFieldsExceptToAmount();
        return;
    }

    const slippage = parseFloat(document.getElementById('slippage-input').value);
    const priceImpact = calculatePriceImpact(inputAmount, outputAmount, fromToken, toToken);
    const tradeFee = calculateTradeFee(inputAmount, fromToken);
    const minReceived = calculateMinimumReceived(outputAmount, slippage, toToken);

    // Log calculated values
    console.log("Price Impact:", priceImpact);
    console.log("Trade Fee:", tradeFee);
    console.log("Minimum Received:", minReceived);

    // Display the results
    document.getElementById('to-amount').value = outputAmount.toFixed(6);
    document.getElementById('price-impact').textContent = priceImpact.toFixed(2) + '%';
    document.getElementById('trade-fee').textContent = tradeFee.toFixed(6) + ' ' + fromToken;
    document.getElementById('min-received').textContent = minReceived.toFixed(6) + ' ' + toToken;
}




function handleSwapCalculationFromOutput() {
    const outputElement = document.getElementById('to-amount');
    const toToken = document.getElementById('to-token').value;

    // Get the current output value as a string
    let outputValue = outputElement.value;
    console.log("Initial Output Value:", outputValue);

    // Remove leading zeros if there's no decimal point
    if (outputValue.match(/^0[1-9]+$/)) {
        console.log("Detected leading zeros, removing them.");
        outputValue = outputValue.replace(/^0+/, '');
        outputElement.value = outputValue;
    }

    // Handle the specific case for "0."
    if (outputValue === "0.") {
        console.log("Detected input '0.'");
        outputElement.value = outputValue; // Display "0."
        return; // Stop further processing to avoid premature parsing
    }

    // Handle the case for "." by converting it to "0."
    if (outputValue === ".") {
        console.log("Detected input '.' and converting to '0.'");
        outputElement.value = "0."; // Convert "." to "0."
        return; // Stop further processing
    }

    // Handle the case for "0" (but not "0." or "0.0")
    if (outputValue === "0") {
        console.log("Detected input '0'");
        outputElement.value = outputValue; // Display "0"
        return; // Stop further processing to avoid premature parsing
    }

    // Handle the case for "0." or "0.0" or any number of zeros after the decimal
    if (outputValue.match(/^0\.\d*$/)) {
        console.log("Detected input '0.' followed by digits or zeros:", outputValue);
        // Allow input to be displayed but not proceed with calculations yet
        if (outputValue.match(/^0\.\d+$/)) {
            console.log("Valid decimal input detected, proceeding with calculations.");
        } else {
            // If it's still a partial input like "0." or "0.0", stop here
            return;
        }
    }

    // Get the allowed decimal places for the token
    const decimalPlaces = decimals[toToken] || 6; // Default to 6 if undefined

    // Trim the output value to the correct number of decimal places
    const [wholePart, decimalPart] = outputValue.split('.');
    if (decimalPart && decimalPart.length > decimalPlaces) {
        console.log(`Trimming output to ${decimalPlaces} decimal places.`);
        outputValue = `${wholePart}.${decimalPart.substring(0, decimalPlaces)}`;
        outputElement.value = outputValue;
    }

    // Validate the output for decimals, ensuring it doesn't exceed the allowed decimals
    validateInputDecimals(outputElement, toToken);
    console.log("After Validation - Output Value:", outputElement.value);

    // Convert output to a float only if it's a valid number
    const outputAmount = parseFloat(outputValue);
    console.log("Parsed Output Amount:", outputAmount);

    // Ensure that "0." or "." is not prematurely processed
    if (isNaN(outputAmount)) {
        console.log("NaN Detected - Exiting function");
        return;
    }

    // If output is exactly 0 (and not "0."), skip unnecessary calculations
    if (outputAmount === 0 && outputValue !== "0." && !outputValue.startsWith("0.")) {
        console.log("Output is 0, displaying '0' and stopping further calculations.");
        outputElement.value = "0";
        return;
    }

    console.log("Valid Output Detected - Proceeding with calculations");

    // Proceed with calculating the required input amount
    const fromToken = document.getElementById('from-token').value;
    const inputAmount = calculateInput(outputAmount, fromToken, toToken);
    console.log("Calculated Input Amount:", inputAmount);

    // Check for insufficient liquidity
    if (inputAmount === "Insufficient liquidity") {
        console.log("Insufficient Liquidity Detected");
        document.getElementById('from-amount').placeholder = "Insufficient liquidity";
        clearOutputFieldsExceptToAmount();
        return;
    }

    const slippage = parseFloat(document.getElementById('slippage-input').value);
    const priceImpact = calculatePriceImpact(inputAmount, outputAmount, fromToken, toToken);
    const tradeFee = calculateTradeFee(outputAmount, toToken);
    const minReceived = calculateMinimumReceived(outputAmount, slippage, toToken);

    // Log calculated values
    console.log("Price Impact:", priceImpact);
    console.log("Trade Fee:", tradeFee);
    console.log("Minimum Received:", minReceived);

    // Display the results
    document.getElementById('from-amount').value = inputAmount.toFixed(6);
    document.getElementById('price-impact').textContent = priceImpact.toFixed(2) + '%';
    document.getElementById('trade-fee').textContent = tradeFee.toFixed(6) + ' ' + fromToken;
    document.getElementById('min-received').textContent = minReceived.toFixed(6) + ' ' + toToken;
}





// Clear output fields when input is invalid or reset
function clearOutputFields() {
    document.getElementById('from-amount').value = '';
    document.getElementById('to-amount').value = '';
    document.getElementById('price-impact').textContent = '-';
    document.getElementById('trade-fee').textContent = '-';
    document.getElementById('min-received').textContent = '-';
}

// Clear output fields except for 'to-amount' when liquidity is insufficient
function clearOutputFieldsExceptToAmount() {
    document.getElementById('from-amount').value = '';
    document.getElementById('price-impact').textContent = '-';
    document.getElementById('trade-fee').textContent = '-';
    document.getElementById('min-received').textContent = '-';
}

// Attach event listeners to input and output fields, and slippage tolerance
document.getElementById('from-amount').addEventListener('input', handleSwapCalculationFromInput);
document.getElementById('to-amount').addEventListener('input', handleSwapCalculationFromOutput);
document.getElementById('from-token').addEventListener('change', handleSwapCalculationFromInput);
document.getElementById('to-token').addEventListener('change', handleSwapCalculationFromInput);
document.getElementById('slippage-input').addEventListener('input', () => {
    // Recalculate based on current input or output values
    if (document.getElementById('from-amount').value) {
        handleSwapCalculationFromInput();
    } else if (document.getElementById('to-amount').value) {
        handleSwapCalculationFromOutput();
    }
});

