const { SecretNetworkClient, MsgExecuteContract } = window.secretjs;

const ERTH_CONTRACT = "secret12wcgts3trvzccyns4s632neqguqsfzv4p0jgxn";
const ERTH_HASH = "55bac6db7ea861e9c59c2d4429623a7b445838fed0b8fd5b4d8de10fa4fb6fe7";
const ANML_CONTRACT = "secret1hsn3045l5eztd8xdeqly67wfver5gh7c7267pk";
const ANML_HASH = "55bac6db7ea861e9c59c2d4429623a7b445838fed0b8fd5b4d8de10fa4fb6fe7";
const REGISTRATION_CONTRACT = "secret1td09kmwqrq3gm67c0g95nlfwhk5dwjyxzm8apc";
const REGISTRATION_HASH = "73c7b12c18162e8fa9a319efddde6fa9930e5b8612574027e32cf611e4735dce";
const GOV_CONTRACT = "secret1k3apatdqj46z6p5sh840k6tlkvnlmc2ug7dyf7";
const GOV_HASH = "a0c6f06962720a447d8759274db48873bf17852b7fcc468af0b8b12ed66e1611";

let erth_viewing_key;

window.addEventListener("keplr_keystorechange", () => {
    console.log("Changed accounts");
    location.reload(true);
});

async function connectKeplr() {
    const chainId = 'secret-4';  // Mainnet chain ID

    if (!window.getOfflineSigner || !window.keplr) {
        alert("Please install the Keplr extension.");
    } else {
        try {
            showLoadingScreen(true);
            document.querySelector("#wallet-connection-box").classList.add('remove');
            await window.keplr.enable(chainId);
            const keplrOfflineSigner = window.getOfflineSignerOnlyAmino(chainId);
            const accounts = await keplrOfflineSigner.getAccounts();
            const address = accounts[0].address;

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
                    document.querySelector("#wallet-name").innerHTML = wallet_name.name.slice(0, 12);
                    start();  // Call start() after successful connection
                } catch (error) {
                    console.log("Error getting wallet name:", error);
                }
            } else {
                console.log("Error connecting to Keplr.");
                document.querySelector("#wallet-connection-box").classList.remove('remove');
            }
        } catch (error) {
            console.error("Error connecting to Keplr:", error);
            document.querySelector("#wallet-connection-box").classList.remove('remove');
        } finally {
        }
    }
}

async function initialization() {
    loadSidebar();
    await connectKeplr();
    // Additional initialization can go here
}

function showLoadingScreen(show) {
    const loadingScreen = document.querySelector("#loading-screen");
    if (loadingScreen) {
        if (show) {
            loadingScreen.classList.remove('remove');
            console.log("Showing loading screen");
        } else {
            loadingScreen.classList.add('remove');
            console.log("Hiding loading screen");
        }
    } else {
        console.error('Loading screen element not found!');
    }
}

// Ensure initialization() is called when the page loads
document.addEventListener("DOMContentLoaded", initialization);
