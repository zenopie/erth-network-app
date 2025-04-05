import { SecretNetworkClient, MsgExecuteContract } from 'secretjs';
import contracts from './contracts';

let secretjs = null; // Signing client (REST)
let queryClient = null; // Query client (gRPC)
const url = "https://lcd.erth.network";      // REST endpoint for Keplr
const grpcUrl = "https://grpc.erth.network"; // gRPC endpoint for queries
const chainId = 'secret-4';                  // Mainnet chain ID

console.log("REST url = " + url);
console.log("gRPC url = " + grpcUrl);

// Initialize both clients
export async function connectKeplr() {
    if (!window.keplr) {
        throw new Error("Keplr extension is not installed.");
    }

    if (!window.getOfflineSigner) {
        throw new Error("Keplr offline signer not available.");
    }

    try {
        // Enable Keplr for the chain
        await window.keplr.enable(chainId);
        const keplrOfflineSigner = window.getOfflineSignerOnlyAmino(chainId);
        const accounts = await keplrOfflineSigner.getAccounts();

        if (!accounts || accounts.length === 0) {
            throw new Error("No accounts found in Keplr.");
        }

        const address = accounts[0].address;
        const enigmaUtils = window.keplr.getEnigmaUtils(chainId);

        // Signing client (REST for transactions)
        secretjs = new SecretNetworkClient({
            url,                   // REST endpoint only
            chainId: chainId,
            wallet: keplrOfflineSigner,
            walletAddress: address,
            encryptionUtils: enigmaUtils,
        });

        // Query client (gRPC for queries)
        queryClient = new SecretNetworkClient({
            url,
            grpcUrl,              // gRPC endpoint only
            chainId: chainId,
        });

        console.log("SecretJS signing client (REST) initialized successfully");
        console.log("SecretJS query client (gRPC) initialized successfully");
    } catch (error) {
        console.error("Error initializing clients:", error);
        throw error;
    }

    const walletName = await window.keplr.getKey(chainId);
    return { secretjs, walletName: walletName.name.slice(0, 12) };
}

// Query function using gRPC client
export async function query(contract, hash, querymsg) {
    if (!queryClient) {
        throw new Error("Query client is not initialized. Ensure Keplr is connected first.");
    }

    console.time("Query Time");
    let resp = await queryClient.query.compute.queryContract({
        contract_address: contract,
        code_hash: hash,
        query: querymsg,
    });
    console.timeEnd("Query Time");
    console.log("Query: ", resp);
    return resp;
}

// Contract execution using REST client
export async function contract(contract, hash, contractmsg) {
    if (!secretjs) {
        throw new Error("SecretJS is not initialized. Ensure Keplr is connected first.");
    }

    let msg = new MsgExecuteContract({
        sender: secretjs.address,
        contract_address: contract,
        code_hash: hash,
        msg: contractmsg,
    });
    let resp = await secretjs.tx.broadcast([msg], {
        gasLimit: 1_000_000,
        gasPriceInFeeDenom: 0.1,
        feeDenom: "uscrt",
        broadcastMode: "Sync",
    });
    console.log("Contract: ", resp);
    return resp;
}

// SNIP-20 Token transfer using REST client
export async function snip(token_contract, token_hash, recipient, recipient_hash, snipmsg, amount) {
    if (!secretjs) {
        throw new Error("SecretJS is not initialized. Ensure Keplr is connected first.");
    }

    let hookmsg64 = btoa(JSON.stringify(snipmsg));
    let msg = new MsgExecuteContract({
        sender: secretjs.address,
        contract_address: token_contract,
        code_hash: token_hash,
        msg: {
            send: {
                recipient: recipient,
                code_hash: recipient_hash,
                amount: amount.toString(),
                msg: hookmsg64,
            }
        }
    });
    let resp = await secretjs.tx.broadcast([msg], {
        gasLimit: 1_000_000,
        gasPriceInFeeDenom: 0.1,
        feeDenom: "scrt",
        broadcastMode: "Sync",
    });
    console.log("Snip: ", resp);
    return resp;
}

// Query SNIP-20 balance using gRPC client
export async function querySnipBalance(token) {
    if (!queryClient) {
        console.error("Query client not initialized in querySnipBalance");
        return "Error";
    }

    try {
        const chainId = secretjs.chainId; // Still need chainId from secretjs for Keplr
        let viewing_key = await window.keplr.getSecret20ViewingKey(chainId, token.contract);

        if (!viewing_key) {
            throw new Error('Viewing key not found');
        }

        const snip_info = await queryClient.query.compute.queryContract({
            contract_address: token.contract,
            code_hash: token.hash,
            query: {
                balance: {
                    address: secretjs.address, // Use address from signing client
                    key: viewing_key,
                    time: Date.now(),
                },
            },
        });

        const snip_balance = snip_info.balance.amount / Math.pow(10, token.decimals);
        return parseFloat(snip_balance);
    } catch (error) {
        console.error(`Error querying SNIP balance for ${token.contract}:`, error);
        return "Error";
    }
}

// Request viewing key (no change, uses secretjs for chainId)
export async function requestViewingKey(token) {
    if (!secretjs) {
        console.error("SecretJS not initialized in requestViewingKey");
        return;
    }

    try {
        const chainId = secretjs.chainId;
        await window.keplr.suggestToken(chainId, token.contract);
        console.log('Viewing key requested successfully');
    } catch (error) {
        console.error('Error requesting viewing key:', error);
    }
}

// Provide liquidity using REST client
export async function provideLiquidity(tokenErthContract, tokenErthHash, tokenBContract, tokenBHash, amountErth, amountB, stake) {
    if (!secretjs) {
        throw new Error("SecretJS is not initialized. Ensure Keplr is connected first.");
    }

    try {
        let erthAllowanceMsg = new MsgExecuteContract({
            sender: secretjs.address,
            contract_address: tokenErthContract,
            code_hash: tokenErthHash,
            msg: {
                increase_allowance: {
                    spender: contracts.exchange.contract,
                    amount: amountErth.toString(),
                },
            },
        });

        let bAllowanceMsg = new MsgExecuteContract({
            sender: secretjs.address,
            contract_address: tokenBContract,
            code_hash: tokenBHash,
            msg: {
                increase_allowance: {
                    spender: contracts.exchange.contract,
                    amount: amountB.toString(),
                },
            },
        });

        let addLiquidityMsg = new MsgExecuteContract({
            sender: secretjs.address,
            contract_address: contracts.exchange.contract,
            code_hash: contracts.exchange.hash,
            msg: {
                add_liquidity: {
                    amount_erth: amountErth.toString(),
                    amount_b: amountB.toString(),
                    pool: tokenBContract,
                    stake,
                },
            },
        });

        let msgs = [erthAllowanceMsg, bAllowanceMsg, addLiquidityMsg];

        let resp = await secretjs.tx.broadcast(msgs, {
            gasLimit: 1_000_000,
            gasPriceInFeeDenom: 0.1,
            feeDenom: "uscrt",
            broadcastMode: "Sync",
        });

        console.log("Liquidity provided successfully:", resp);
        return resp;
    } catch (error) {
        console.error("Error providing liquidity:", error);
        throw error;
    }
}