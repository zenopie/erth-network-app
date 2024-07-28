const { SecretNetworkClient, MsgExecuteContract } = window.secretjs;

const ERTH_CONTRACT = "secret12wcgts3trvzccyns4s632neqguqsfzv4p0jgxn";
const ERTH_HASH = "55bac6db7ea861e9c59c2d4429623a7b445838fed0b8fd5b4d8de10fa4fb6fe7";
const ANML_CONTRACT = "secret1hsn3045l5eztd8xdeqly67wfver5gh7c7267pk";
const ANML_HASH = "55bac6db7ea861e9c59c2d4429623a7b445838fed0b8fd5b4d8de10fa4fb6fe7";
const PROTOCOL_CONTRACT = "secret1vl3auz6w3lxaq56uf06d442edm6xxv2qvhwcdq";
const PROTOCOL_HASH = "f798c2abe39a705e21bfdfa4aef32dc9509dd4fc36f6a92c0525e1b3fcb9e838";
const GOV_CONTRACT = "secret1k3apatdqj46z6p5sh840k6tlkvnlmc2ug7dyf7";
const GOV_HASH = "a0c6f06962720a447d8759274db48873bf17852b7fcc468af0b8b12ed66e1611";

let erth_viewing_key;

window.addEventListener("keplr_keystorechange", () => {
    console.log("changed accounts");
    location.reload(true);
});

async function connectKeplr() {
    const chainId = 'secret-4';  // Mainnet chain ID

    if (!window.getOfflineSigner || !window.keplr) {
        alert("Please install the Keplr extension.");
    } else {
        try {
            // Enable Keplr and check if the chain is already registered
            await window.keplr.enable(chainId);

            // @ts-ignore
            const keplrOfflineSigner = window.getOfflineSignerOnlyAmino(chainId);
            const accounts = await keplrOfflineSigner.getAccounts();
            
            const address = accounts[0].address;

            // Initialize the Secret Network client
            window.secretjs = new SecretNetworkClient({
                url: "https://lcd.mainnet.secretsaturn.net",
                chainId: chainId,
                wallet: keplrOfflineSigner,
                walletAddress: address,
                encryptionUtils: window.keplr.getEnigmaUtils(chainId),
            });

            if (address) {
                try {
                    let wallet_name = await window.keplr.getKey(chainId);
                    console.log(wallet_name);
                    document.querySelector("#wallet-name").innerHTML = wallet_name.name.slice(0, 12);
                    start();
                } catch (error) {
                    console.log("Error getting wallet name:", error);
                }
            } else {
                console.log("Error connecting to Keplr.");
            }
        } catch (error) {
            console.error("Error connecting to Keplr:", error);
        }
    }
}

// Ensure connectKeplr is called when the page loads
document.addEventListener("DOMContentLoaded", connectKeplr);


