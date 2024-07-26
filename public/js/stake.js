async function stake() {
    checkAccountExists(secretjs.address);
    let input = document.getElementById('stake');
    let snipmsg = {deposit: {}};
    await snip(ERTH_CONTRACT, ERTH_HASH, GOV_CONTRACT, GOV_HASH, snipmsg, input.value);
    input.value = 0;
    start();
}

async function unstake() {
    checkAccountExists(secretjs.address);
    let input = document.getElementById('unstake');
    console.log(input.value);
    let msg = {withdraw: {amount: input.value}};
    await contract(GOV_CONTRACT, GOV_HASH, msg);
    input.value = 0;
    start();
}

async function addAllocationOption() {
    checkAccountExists(secretjs.address);
    let input = document.getElementById('allocation');
    console.log(input.value);
    let msg = {add_allocation_option: {address: input.value}};
    await contract(GOV_CONTRACT, GOV_HASH, msg);
    input.value = "";
}

async function faucet() {
    checkAccountExists(secretjs.address);
    let msg = {faucet: {}};
    await contract(GOV_CONTRACT, GOV_HASH, msg);
}

async function viewingKey() {
    await window.keplr.suggestToken(chainId, ERTH_CONTRACT);
}

async function check_deposit(){
    let querymsg = {get_stake: {address: window.secretjs.address}}
    let allocation_info =  await query(GOV_CONTRACT, GOV_HASH, querymsg);
    // Find the HTML element by its ID
    let allocationInfoDiv = document.getElementById('allocation-info');
    // Display the allocation information
    allocationInfoDiv.innerHTML = "Stake: " + allocation_info.amount;
}

function start() {
    check_deposit();
}