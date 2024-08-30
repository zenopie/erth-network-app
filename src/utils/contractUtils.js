import { SecretNetworkClient, MsgExecuteContract } from 'secretjs';
import tokens from "./tokens.js"

let secretjs = null;
//const url = "https://rpc.ankr.com/http/scrt_cosmos";
//const url = "https://lcd.mainnet.secretsaturn.net";
const url = "https://lcd.archive.scrt.marionode.com";

export async function connectKeplr() {
    const chainId = 'secret-4';  // Mainnet chain ID

    if (!window.getOfflineSigner || !window.keplr) {
        alert("Please install the Keplr extension.");
        throw new Error("Keplr extension is not installed.");
    }

    await window.keplr.enable(chainId);
    const keplrOfflineSigner = window.getOfflineSignerOnlyAmino(chainId);
    const accounts = await keplrOfflineSigner.getAccounts();
    const address = accounts[0].address;

    secretjs = new SecretNetworkClient({
        url,
        chainId: chainId,
        wallet: keplrOfflineSigner,
        walletAddress: address,
        encryptionUtils: window.keplr.getEnigmaUtils(chainId),
    });

    const walletName = await window.keplr.getKey(chainId);
    return { secretjs, walletName: walletName.name.slice(0, 12) };
}

// Query function
export async function query(contract, hash, querymsg) {
    if (!secretjs) {
        throw new Error("SecretJS is not initialized. Ensure Keplr is connected first.");
    }

    let resp = await secretjs.query.compute.queryContract({
        contract_address: contract,
        code_hash: hash,
        query: querymsg,
    });
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
    });
    console.log("Snip: ", resp);
}

export async function querySnipBalance(token) {
    try {
        const chainId = window.secretjs.chainId;
        const viewing_key = await window.keplr.getSecret20ViewingKey(chainId, token.contract);

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

        console.log('SNIP info:', snip_info);

        // Handle micro units conversion to standard units
        const snip_balance = snip_info.balance.amount / Math.pow(10, token.decimals);
        return snip_balance.toFixed(6);  // Return balance formatted to 6 decimal places
    } catch (error) {
        console.error(`Error querying SNIP balance for ${token.contract}:`, error);
        return "Error";
    }
}

