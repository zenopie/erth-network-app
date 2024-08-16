let reserves = {}; // Define reserves globally

async function start() {
    console.log("starting provide.js");

    const poolContractAddress = pool_contracts["ANML"]; // Replace with actual pool contract address
    const poolHash = pool_hashes["ANML"]; // Replace with actual pool contract hash

    if (!poolContractAddress || !poolHash) {
        console.error("No contract address or hash found for the pool.");
        return;
    }

    const stateInfo = await query(poolContractAddress, poolHash);

    reserves = {
        ERTH: parseInt(stateInfo.token_erth_reserve),
        ANML: parseInt(stateInfo.token_b_reserve),
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

    return stateInfo.state; // Assuming the actual state is under 'state' key
}

// Function to execute add liquidity
async function executeAddLiquidity() {
    try {
        const amountErth = document.getElementById('provide-erth').value;
        const amountAnml = document.getElementById('provide-anml').value;

        // Convert to micro units
        const amountErthMicro = toMicroUnits(amountErth, 'ERTH');
        const amountAnmlMicro = toMicroUnits(amountAnml, 'ANML');

        if (isNaN(amountErthMicro) || isNaN(amountAnmlMicro) || amountErthMicro <= 0 || amountAnmlMicro <= 0) {
            alert('Invalid amounts entered.');
            return;
        }

        // Create allowance and add liquidity messages here, as in the provided executeAddLiquidity function
        // ... (same as your provided function)

        // Combine all messages into a single array
        let msgs = [erthAllowanceMsg, bAllowanceMsg, addLiquidityMsg];

        // Send all messages in a single transaction
        let resp = await secretjs.tx.broadcast(msgs, {
            gasLimit: 1_000_000, // Adjust the gas limit as needed
            gasPriceInFeeDenom: 0.1,
            feeDenom: "uscrt",
        });

        console.log("Transaction Response:", resp);
        document.getElementById('provide-result').textContent = "Liquidity provided successfully!";
    } catch (error) {
        console.error('Error providing liquidity:', error);
        document.getElementById('provide-result').textContent = "Error providing liquidity. Check the console for details.";
    }
}

// Utility function to convert macro units to micro units
function toMicroUnits(amount, token) {
    return Math.floor(amount * Math.pow(10, decimals[token]));
}

// Utility function to update the other input based on the pool ratio
function updateProvideInput(token) {
    const inputAmount = parseFloat(document.getElementById(`provide-${token.toLowerCase()}`).value);
    if (isNaN(inputAmount) || inputAmount <= 0) return;

    const otherToken = token === 'ERTH' ? 'ANML' : 'ERTH';
    const otherReserve = reserves[otherToken];
    const tokenReserve = reserves[token];

    const otherAmount = (inputAmount * otherReserve) / tokenReserve;
    document.getElementById(`provide-${otherToken.toLowerCase()}`).value = otherAmount.toFixed(6);
}

async function executeAddLiquidity() {
    try {
        // Get the input values from the form
        const amountErth = document.getElementById('provide-erth').value;
        const amountB = document.getElementById('provide-anml').value;

        // Validate the input amounts
        if (!amountErth || !amountB || isNaN(amountErth) || isNaN(amountB) || amountErth <= 0 || amountB <= 0) {
            alert('Invalid amounts entered.');
            return;
        }

        // Convert the amounts to micro units
        const amountErthMicro = toMicroUnits(amountErth, 'ERTH');
        const amountBMicro = toMicroUnits(amountB, 'ANML');

        // Define the contract and hash variables
        const tokenErthContract = tokens["ERTH"].contract; // Replace with actual ERTH token contract address
        const tokenErthHash = tokens["ERTH"].hash; // Replace with actual ERTH token contract hash
        const tokenBContract = tokens["ANML"].contract; // Replace with actual B token contract address
        const tokenBHash = tokens["ANML"].hash; // Replace with actual B token contract hash
        const pool_address = pool_contracts["ANML"]; // Replace with actual pool contract address
        const pool_hash = pool_hashes["ANML"]; // Replace with actual pool contract hash

        // Step 1: Create allowance message for ERTH token
        let erthAllowanceMsg = new MsgExecuteContract({
            sender: secretjs.address,
            contract_address: tokenErthContract,
            code_hash: tokenErthHash,
            msg: {
                increase_allowance: {
                    spender: pool_address,
                    amount: amountErthMicro.toString(),
                },
            },
        });

        // Step 2: Create allowance message for ANML token
        let bAllowanceMsg = new MsgExecuteContract({
            sender: secretjs.address,
            contract_address: tokenBContract,
            code_hash: tokenBHash,
            msg: {
                increase_allowance: {
                    spender: pool_address,
                    amount: amountBMicro.toString(),
                },
            },
        });

        // Step 3: Create add liquidity message
        let addLiquidityMsg = new MsgExecuteContract({
            sender: secretjs.address,
            contract_address: pool_address,
            code_hash: pool_hash,
            msg: {
                add_liquidity: {
                    amount_erth: amountErthMicro.toString(),
                    amount_b: amountBMicro.toString(),
                },
            },
        });

        // Combine all messages into a single array
        let msgs = [erthAllowanceMsg, bAllowanceMsg, addLiquidityMsg];

        // Send all messages in a single transaction
        let resp = await secretjs.tx.broadcast(msgs, {
            gasLimit: 1_000_000, // Adjust the gas limit as needed
            gasPriceInFeeDenom: 0.1,
            feeDenom: "uscrt",
        });

        // Display the transaction response
        console.log("Transaction Response:", resp);
        document.getElementById('provide-result').textContent = "Liquidity provided successfully!";
    } catch (error) {
        console.error('Error providing liquidity:', error);
        document.getElementById('provide-result').textContent = "Error providing liquidity. Check the console for details.";
    }
}


// Attach event listeners
document.getElementById('provide-erth').addEventListener('input', () => updateProvideInput('ERTH'));
document.getElementById('provide-anml').addEventListener('input', () => updateProvideInput('ANML'));

