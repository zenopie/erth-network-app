// Function to initialize the sidebar functionalities
function initializeSidebar() {
    const sidebar = document.querySelector(".sidebar");
    const menuToggle = document.querySelector('.menu-toggle');
    const homeSection = document.querySelector(".home-section");

    if (!sidebar || !menuToggle || !homeSection) {
        console.error('Sidebar, menu toggle, or home section not found!');
        return;
    }

    if (window.innerWidth <= 800) {
        menuToggle.addEventListener('click', function() {
            sidebar.classList.toggle('close');
        });
    }
}

// Function to load the sidebar
function loadSidebar() {
    fetch('html/sidebar.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('sidebar-placeholder').innerHTML = data;
            initializeSidebar(); // Call the sidebar initialization function
        })
        .catch(error => console.error('Error loading sidebar:', error));
}

// Ensure loadSidebar is called when the page loads
document.addEventListener("DOMContentLoaded", loadSidebar);

// Global functions

async function try_query_balance(viewing_key, contract, hash) {
    try {
        let tx = await window.secretjs.query.compute.queryContract({
            contract_address: contract,
            code_hash: hash,
            query: {
                balance: {
                    address: window.secretjs.walletAddress,
                    key: viewing_key,
                    time: Date.now()
                }
            }
        });
        console.log(tx);
        let snip_balance = tx.balance.amount / 1000000;
        return snip_balance;
    } catch (error) {
        console.error("Error querying balance:", error);
    }
}

function floorToDecimals(num, dec) {
    const multiplier = 10 ** dec;
    return Math.floor(num * multiplier) / multiplier;
}

async function snip(contract, hash, recipient, recipient_hash, snipmsg, amount) {
    let hookmsg64 = btoa(JSON.stringify(snipmsg));
    let msg = new MsgExecuteContract({
        sender: secretjs.address,
        contract_address: contract,
        code_hash: hash,
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
    console.log(resp);
};

async function query(contract, hash, querymsg) {
    let tx = await secretjs.query.compute.queryContract({
        contract_address: contract,
        code_hash: hash,
        query: querymsg,
    });
    console.log(tx);
    return tx;
};

async function contract(contract, hash, contractmsg) {
    let msg = new MsgExecuteContract({
        sender: secretjs.address,
        contract_address: contract,
        code_hash: hash,
        msg: contractmsg
    });
    let resp = await secretjs.tx.broadcast([msg], {
        gasLimit: 1_000_000,
        gasPriceInFeeDenom: 0.1,
        feeDenom: "uscrt",
    });
    console.log(resp);
    return resp;
};

function formatDateFromUTCNanoseconds(nanoseconds) {
    const milliseconds = nanoseconds / 1000000;
    const date = new Date(milliseconds);
    const options = {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short'
    };
    return date.toLocaleString('en-US', options);
}

// Navigation scripts
document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const homeSection = document.querySelector(".home-section");

    if (sidebar && homeSection && menuToggle) {
        if (window.innerWidth <= 800) {
            menuToggle.addEventListener('click', function() {
                sidebar.classList.toggle('close');
            });
        }
    }
});

/**
 * Function to check if a given account exists based on the account address.
 * @param {string} accountAddress - The account address to check.
 * @returns {Promise<object>} - Resolves with the account data if found, otherwise rejects with an error message.
 */
async function checkAccountExists(accountAddress) {
    const baseUrl = 'https://api.pulsar.scrttestnet.com/cosmos/auth/v1beta1/accounts/';
    const accountUrl = `${baseUrl}${accountAddress}`;
  
    try {
        const response = await fetch(accountUrl);
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Account not found. Account was never seeded with testnet SCRT.');
            } else {
                throw new Error(`An error occurred: ${response.statusText}`);
            }
        }
        const data = await response.json(); // or response.text(), depending on your API response format
        return data;
    } catch (error) {
        alert(error.message);
    }
}
