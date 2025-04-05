import { SecretNetworkClient, MsgExecuteContract } from 'secretjs';
import contracts from './contracts';

let secretjs = null;
const grpcUrl = "https://grpc.erth.network"; // Public gRPC endpoint for browser

console.log("gRPC url = " + grpcUrl);

export async function connectKeplr() {
    const chainId = 'secret-4';  // Mainnet chain ID

    if (!window.getOfflineSigner || !window.keplr) {
        throw new Error("Keplr extension is not installed.");
    }

    await window.keplr.enable(chainId);
    const keplrOfflineSigner = window.getOfflineSignerOnlyAmino(chainId);
    const accounts = await keplrOfflineSigner.getAccounts();
    const address = accounts[0].address;

    try {
        secretjs = new SecretNetworkClient({
            grpcUrl,
            chainId: chainId,
            wallet: keplrOfflineSigner,
            walletAddress: address,
            encryptionUtils: window.keplr.getEnigmaUtils(chainId),
        });
    } catch (error) {
        console.error("Error creating SecretJS client:", error);
    }

    const walletName = await window.keplr.getKey(chainId);

    return { secretjs, walletName: walletName.name.slice(0, 12) };
}

// Query function with timing
export async function query(contract, hash, querymsg) {
    if (!secretjs) {
        throw new Error("SecretJS is not initialized. Ensure Keplr is connected first.");
    }

    console.time("Query Time"); // Measure gRPC query speed
    let resp = await secretjs.query.compute.queryContract({
        contract_address: contract,
        code_hash: hash,
        query: querymsg,
    });
    console.timeEnd("Query Time");
    console.log("Query: ", resp);
    return resp;
}

// Contract execution function
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

// SNIP-20 Token transfer with message
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
        feeDenom: "uscrt",
        broadcastMode: "Sync",
    });
    console.log("Snip: ", resp);
    return resp; // Added return
}

// Query SNIP-20 balance
export async function querySnipBalance(token) {
    try {
        const chainId = window.secretjs.chainId;
        let viewing_key = await window.keplr.getSecret20ViewingKey(chainId, token.contract);

        if (!viewing_key) {
            throw new Error('Viewing key not found');
        }

        const snip_info = await window.secretjs.query.compute.queryContract({
            contract_address: token.contract,
            code_hash: token.hash,
            query: {
                balance: {
                    address: window.secretjs.address,
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

// Request viewing key
export async function requestViewingKey(token) {
    try {
        const chainId = window.secretjs.chainId;
        await window.keplr.suggestToken(chainId, token.contract);
        console.log('Viewing key requested successfully');
    } catch (error) {
        console.error('Error requesting viewing key:', error);
    }
}

// Provide liquidity
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