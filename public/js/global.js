const { SecretNetworkClient, MsgExecuteContract } = window.secretjs;


const ERTH_CONTRACT = "secret12wcgts3trvzccyns4s632neqguqsfzv4p0jgxn";
const ERTH_HASH = "55bac6db7ea861e9c59c2d4429623a7b445838fed0b8fd5b4d8de10fa4fb6fe7";
const ANML_CONTRACT =  "secret1hsn3045l5eztd8xdeqly67wfver5gh7c7267pk";
const ANML_HASH =  "55bac6db7ea861e9c59c2d4429623a7b445838fed0b8fd5b4d8de10fa4fb6fe7";
const PROTOCOL_CONTRACT =  "secret1vl3auz6w3lxaq56uf06d442edm6xxv2qvhwcdq";
const PROTOCOL_HASH =  "f798c2abe39a705e21bfdfa4aef32dc9509dd4fc36f6a92c0525e1b3fcb9e838";
const GOV_CONTRACT =  "secret1k3apatdqj46z6p5sh840k6tlkvnlmc2ug7dyf7";
const GOV_HASH =  "a0c6f06962720a447d8759274db48873bf17852b7fcc468af0b8b12ed66e1611";


let erth_viewing_key;

window.onload = async () => {
    connectKeplr();
};
window.addEventListener("keplr_keystorechange", () => {
    console.log("changed accounts")
    location.reload(true);
})
async function connectKeplr() {
    this.chainId = 'secret-4';  // Mainnet chain ID

    if (!window.getOfflineSigner || !window.keplr) {
        alert("Please install the Keplr extension.");
    } else {
        try {
            // Enable Keplr and check if the chain is already registered
            await window.keplr.enable(this.chainId);

            // @ts-ignore
            const keplrOfflineSigner = window.getOfflineSignerOnlyAmino(this.chainId);
            const accounts = await keplrOfflineSigner.getAccounts();
            
            this.address = accounts[0].address;

            // Initialize the Secret Network client
            window.secretjs = new SecretNetworkClient({
                url: "https://lcd.mainnet.secretsaturn.net",
                chainId: this.chainId,
                wallet: keplrOfflineSigner,
                walletAddress: this.address,
                encryptionUtils: window.keplr.getEnigmaUtils(this.chainId),
            });
        } catch (error) {
            console.error("Error connecting to Keplr:", error);
        }
    }

    if (this.address) {
        try {
            let wallet_name = await window.keplr.getKey(this.chainId);
            console.log(wallet_name);
            document.querySelector("#wallet-name").innerHTML = wallet_name.name.slice(0,12);
            start();
        } catch (error) {
            console.log("Error getting wallet name:", error);
        }
    } else {
        console.log("Error connecting to Keplr.");
    }
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

async function snip(contract, hash, recipient, recipient_hash, snipmsg, amount){
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

async function query(contract, hash, querymsg){
	let tx = await secretjs.query.compute.queryContract({
	  contract_address: contract,
	  code_hash: hash,
	  query: querymsg,
	});
	console.log(tx);
    return tx;
};



async function contract(contract, hash, contractmsg){
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

//navigation scripts
const menuToggle = document.querySelector('.menu-toggle');
const sidebar = document.querySelector('.sidebar');
const homeSection = document.querySelector(".home-section");
const governanceItem = document.querySelector('.submenu > a');
const submenuList = document.querySelector('.submenu-list');

if (window.innerWidth > 600) {
    sidebar.addEventListener("mouseover", () => {
        sidebar.classList.remove("close");
    });
    homeSection.addEventListener("mouseover", () => {
        //sidebar.classList.add("close");
        //submenuList.classList.add('remove');
        //governanceItem.parentElement.classList.remove('open'); 
    });
}

menuToggle.addEventListener('click', function() {
    sidebar.classList.toggle('close');
    // If sidebar is not closed (meaning it's open), hide the menuToggle
    if (!sidebar.classList.contains('close')) {
        menuToggle.style.display = 'none';
    } else {
        menuToggle.style.display = 'block';
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