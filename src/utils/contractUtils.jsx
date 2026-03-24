import { SecretNetworkClient, MsgExecuteContract } from 'secretjs';
import contracts, { populateContracts } from './contracts';
import { populateTokens } from './tokens';
import { toMacroUnits } from './mathUtils';

let secretjs = null; // Signing client (LCD)
const url = "https://lcd.erth.network";      // LCD endpoint
const chainId = 'secret-4';                  // Mainnet chain ID

// Query client initialized at module level - no wallet needed for public queries
let queryClient = new SecretNetworkClient({
    url,
    chainId: chainId,
});

// Contract Registry
export const REGISTRY_CONTRACT = "secret1ql943kl7fd7pyv9njf7rmngxhzljncgx6eyw5j";
export const REGISTRY_HASH = "2a53df1dc1d8f37ecddd9463930c9caa4940fed94f9a8cd113d6285eef09445b";

// In-memory storage for registry data
let registryData = {
    contracts: {},
    tokens: {},
    lastUpdated: null
};

// Initialize from localStorage on module load
try {
    const stored = localStorage.getItem('contractRegistry');
    if (stored) {
        registryData = JSON.parse(stored);
        // Populate tokens and contracts from localStorage
        if (registryData.tokens) {
            populateTokens(registryData.tokens);
        }
        if (registryData.contracts) {
            populateContracts(registryData.contracts);
        }
        console.log("Registry data loaded from localStorage");
    }
} catch (error) {
    console.error("Error loading registry from localStorage:", error);
}

console.log("LCD url = " + url);

// Helper function to log transactions to browser storage
function logTransaction(contract_address, hash, msg, resp) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        user_address: secretjs.address,
        contract_address,
        contract_hash: hash,
        msg: msg,
        tx_hash: resp.transactionHash,
        response: resp,
        timestamp
    };
    
    const existingLogs = JSON.parse(localStorage.getItem('transactionLogs') || '[]');
    existingLogs.push(logEntry);
    localStorage.setItem('transactionLogs', JSON.stringify(existingLogs));
}

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

        // Query client (LCD)
        queryClient = new SecretNetworkClient({
            url,
            chainId: chainId,
        });

        console.log("SecretJS signing client (LCD) initialized successfully");
        console.log("SecretJS query client (LCD) initialized successfully");
    } catch (error) {
        console.error("Error initializing clients:", error);
        throw error;
    }

    const walletName = await window.keplr.getKey(chainId);

    // Query the registry only if not already loaded (e.g., from login)
    if (!registryData.lastUpdated) {
        await queryRegistry();
    } else {
        console.log("Registry already loaded, skipping query");
    }

    return { secretjs, walletName: walletName.name.slice(0, 12) };
}

// Query the contract registry, store data, and return token addresses
async function queryRegistry() {
    if (!queryClient) {
        console.error("Query client not initialized");
        return [];
    }

    try {
        console.log("Querying contract registry...");
        const response = await queryClient.query.compute.queryContract({
            contract_address: REGISTRY_CONTRACT,
            code_hash: REGISTRY_HASH,
            query: { get_all_contracts: {} },
        });

        const tokenAddresses = [];

        if (response && response.contracts) {
            const contractsData = {};
            const tokensData = {};

            response.contracts.forEach(item => {
                const contractInfo = {
                    contract: item.info.address,
                    hash: item.info.code_hash
                };

                if (item.name.includes('token')) {
                    const tokenName = item.name.replace('_token', '').toUpperCase();
                    tokensData[tokenName] = contractInfo;
                    tokenAddresses.push(item.info.address);
                } else {
                    contractsData[item.name] = contractInfo;
                }
            });

            registryData.contracts = contractsData;
            registryData.tokens = tokensData;
            registryData.lastUpdated = new Date().toISOString();

            populateTokens(tokensData);
            populateContracts(contractsData);

            localStorage.setItem('contractRegistry', JSON.stringify(registryData));
            console.log("Registry data loaded:", registryData);
        }

        return tokenAddresses;
    } catch (error) {
        console.error("Error querying registry:", error);
        return [];
    }
}

// Ensure registry is loaded (for first-time visitors without localStorage cache)
export async function ensureRegistryLoaded() {
    if (registryData.lastUpdated) return true;
    try {
        await queryRegistry();
        return !!registryData.lastUpdated;
    } catch (error) {
        console.error("Failed to load registry:", error);
        return false;
    }
}

// Clear login permit from localStorage
export function clearLoginPermit() {
    localStorage.removeItem('erth_login_permit');
    localStorage.removeItem('erth_user_address');
    localStorage.removeItem('erth_permit_expiration');
}

// Get the stored login permit
export function getLoginPermit() {
    try {
        const permitStr = localStorage.getItem('erth_login_permit');
        if (permitStr) {
            // Check if permit has expired
            const expiration = localStorage.getItem('erth_permit_expiration');
            if (expiration) {
                const currentTime = Math.floor(Date.now() / 1000);
                const expirationTime = parseInt(expiration, 10);

                if (currentTime >= expirationTime) {
                    console.log("Permit expired, logging out...");
                    clearLoginPermit();
                    window.location.reload();
                    return null;
                }
            }

            return JSON.parse(permitStr);
        }
        return null;
    } catch (error) {
        console.error("Error retrieving login permit:", error);
        return null;
    }
}

// Get the user address
export function getUserAddress() {
    return localStorage.getItem('erth_user_address') || null;
}

// Get a valid address for contract queries (connected wallet > stored address > placeholder)
export function getQueryAddress() {
    return window.secretjs?.address || getUserAddress() || REGISTRY_CONTRACT;
}

// Query registry and return token addresses (for permit signing)
export async function queryRegistryAndGetTokens() {
    return queryRegistry();
}

// Query function using LCD client
export async function query(contract, hash, querymsg) {
    if (!queryClient) {
        throw new Error("Query client is not initialized. Ensure Keplr is connected first.");
    }

    let resp = await queryClient.query.compute.queryContract({
        contract_address: contract,
        code_hash: hash,
        query: querymsg,
    });
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
    logTransaction(contract, hash, contractmsg, resp);
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
                recipient_code_hash: recipient_hash,
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
    logTransaction(token_contract, token_hash, snipmsg, resp);
    return resp;
}

// Query SNIP-20 balance using LCD client with permit
export async function querySnipBalance(token) {
    if (!queryClient) {
        console.error("Query client not initialized in querySnipBalance");
        return "Error";
    }

    try {
        const permit = getLoginPermit();
        const userAddress = getUserAddress();

        if (!permit || !userAddress) {
            throw new Error('Login permit not found. Please login again.');
        }

        const snip_info = await queryClient.query.compute.queryContract({
            contract_address: token.contract,
            code_hash: token.hash,
            query: {
                with_permit: {
                    permit: permit,
                    query: {
                        balance: {
                            address: userAddress,
                        }
                    }
                }
            },
        });

        return toMacroUnits(Number(snip_info.balance.amount), token);
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

// Add liquidity using REST client (direct staking approach)
export async function provideLiquidity(tokenErthContract, tokenErthHash, tokenBContract, tokenBHash, amountErth, amountB) {
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

        let contractmsg = {
            add_liquidity: {
                amount_erth: amountErth.toString(),
                amount_b: amountB.toString(),
                pool: tokenBContract,
            },
        };

        let addLiquidityMsg = new MsgExecuteContract({
            sender: secretjs.address,
            contract_address: contracts.exchange.contract,
            code_hash: contracts.exchange.hash,
            msg: contractmsg,
        });

        let msgs = [erthAllowanceMsg, bAllowanceMsg, addLiquidityMsg];

        let resp = await secretjs.tx.broadcast(msgs, {
            gasLimit: 1_000_000,
            gasPriceInFeeDenom: 0.1,
            feeDenom: "uscrt",
            broadcastMode: "Sync",
        });

        console.log("Liquidity provide:", resp);
        logTransaction(contracts.exchange.contract, contracts.exchange.hash, contractmsg, resp);
        return resp;
    } catch (error) {
        console.error("Error providing liquidity:", error);
        throw error;
    }
}
// Query native SCRT balance
export async function queryNativeBalance() {
    if (!secretjs) {
        throw new Error("SecretJS is not initialized. Ensure Keplr is connected first.");
    }
    
    try {
        const response = await secretjs.query.bank.balance({
            address: secretjs.address,
            denom: "uscrt",
        });
        
        if (response && response.balance && response.balance.amount) {
            const balanceInUscrt = parseFloat(response.balance.amount);
            return isNaN(balanceInUscrt) ? 0 : balanceInUscrt / 1e6;
        }
        return 0;
    } catch (error) {
        console.error("Error fetching native SCRT balance:", error);
        return "Error";
    }
}
