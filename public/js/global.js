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
            initializeLoginLogout(); // Initialize login/logout functionality
        })
        .catch(error => console.error('Error loading sidebar:', error));
}

// Initialize the login/logout functionality
function initializeLoginLogout() {
    const profileDetails = document.querySelector('.profile-details');
    const walletName = document.querySelector('#wallet-name');
    const logButton = profileDetails.querySelector('i');

    if (!profileDetails || !walletName || !logButton) {
        console.error('Profile details, wallet name, or log button not found!');
        return;
    }

    logButton.addEventListener('click', function() {
        if (walletName.textContent === "Log In") {
            connectKeplr();
        } else {
            disconnectKeplr();
        }
    });
}

// Ensure loadSidebar is called when the page loads
document.addEventListener("DOMContentLoaded", loadSidebar);

// Global functions


function showLoadingScreen(show) {
    const loadingScreen = document.querySelector('#loading-screen');
    if (!loadingScreen) {
        console.error('Loading screen element not found!');
        return;
    }
    if (show) {
        loadingScreen.classList.remove('remove');
        console.log("Showing loading screen");
    } else {
        loadingScreen.classList.add('remove');
        console.log("Hiding loading screen");
    }
}

function transitionBetweenScreens(hideSelector, showSelector) {
    console.log(`Starting transition from ${hideSelector} to ${showSelector}`);
    showLoadingScreen(true);

    setTimeout(() => {
        document.querySelector(hideSelector).classList.add("remove");
        document.querySelector(showSelector).classList.remove("remove");
        showLoadingScreen(false);
        console.log(`Completed transition from ${hideSelector} to ${showSelector}`);
    }, 1000); // Adjust the delay as needed
}


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
}

async function query(contract, hash, querymsg) {
    let tx = await window.secretjs.query.compute.queryContract({
        contract_address: contract,
        code_hash: hash,
        query: querymsg,
    });
    console.log(tx);
    return tx;
}

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
}

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

// Function to check if a given account exists based on the account address.
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
        const data = await response.json();
        return data;
    } catch (error) {
        alert(error.message);
    }
}

const veriff = Veriff({
    host: 'https://stationapi.veriff.com',
    apiKey: '0c926c59-8076-42a5-a7a3-80727c13e461',
    parentId: 'veriff-root',
    onSession: function(err, response) {
        window.location.href = response.verification.url;
    }
});

async function check_verification_status() {
    console.log("Entering check_verification_status");
    let querymsg = {
        registration_status: {
            address: secretjs.address
        }
    };
    let anml_status = "not_verified";
    let contract_value = await query(REGISTRATION_CONTRACT, REGISTRATION_HASH, querymsg);
    if (contract_value.registration_status == "registered") {
        const now = Date.now();
        const oneDayInMillis = 24 * 60 * 60 * 1000; // 86,400,000 milliseconds in a day
        let next_claim = contract_value.last_claim / 1000000 + oneDayInMillis; // divide to turn nanos into milliseconds then add one day
        if (now > next_claim) {
            anml_status = "claimable";
        } else {
            anml_status = "claimed";
        }
    } else {
        const pending_check_url = '/api/pending/' + window.secretjs.address;
        await fetch(pending_check_url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('GET request successful:', data);
                if (data.pending) {
                    anml_status = "pending";
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
    }
    console.log("Anml Status:", anml_status);
    if (anml_status == "claimable") {
        transitionBetweenScreens("#loading-screen", "#claim-box");
    } else if (anml_status == "claimed") {
        transitionBetweenScreens("#loading-screen", "#complete-box");
    } else if (anml_status == "not_verified") {
        transitionBetweenScreens("#loading-screen", "#register-box");
    } else if (anml_status == "pending") {
        transitionBetweenScreens("#loading-screen", "#pending-box");
    }
    console.log("Exiting check_verification_status");
}


function registerButton() {
    console.log("Register button clicked");
    veriff.setParams({
        person: {
            givenName: ' ',
            lastName: ' '
        },
        vendorData: window.secretjs.address
    });
    veriff.mount();
    transitionBetweenScreens("#register-box", "#disclaimer-box");
}


async function claimButton() {
    console.log("Claim button clicked");
    let contractmsg = {
        claim: {}
    };
    let tx = await contract(contractmsg);

    if (tx.arrayLog) {
        const logEntry = tx.arrayLog.find(
            (log) => log.type === "message" && log.key === "result"
        );
        transitionBetweenScreens("#loading", "#complete-box");
    } else {
        console.log("test");
    }
}
