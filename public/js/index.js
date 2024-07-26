

const veriff = Veriff({
  host: 'https://stationapi.veriff.com',
  apiKey: '388c7a11-9b98-4fa9-b5a2-73348479326a',
  parentId: 'veriff-root',
  onSession: function(err, response) {
    window.location.href = response.verification.url;
  }
});





async function check_verification_status(){
  let querymsg = {
    registration_status: {
      address: secretjs.address
    }
  };
  let anml_status = "not_verified";
  let contract_value =  await query(PROTOCOL_CONTRACT, PROTOCOL_HASH, querymsg);
  if (contract_value.registration_status == "registered") {
    const now = Date.now();
    const oneDayInMillis = 24 * 60 * 60 * 1000; // 86,400,000 milliseconds in a day
    let next_claim = contract_value.last_claim / 1000000 + oneDayInMillis; // divide to turn nanos into miliseconds then add one day
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
      'Content-Type': 'application/json', // Set the content type to JSON
    }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json(); // Assuming the response is JSON
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
  console.log("Anml Status: " + anml_status);
  if (anml_status == "claimable") {
    document.querySelector("#loading").classList.add("remove");
    document.querySelector("#claim-box").classList.remove("remove");
  } else if (anml_status == "claimed") {
    document.querySelector("#loading").classList.add("remove");
    document.querySelector("#complete-box").classList.remove("remove");
  } else if (anml_status == "not_verified") {
    document.querySelector("#loading").classList.add("remove");
    document.querySelector("#register-box").classList.remove("remove");
  } else if (anml_status == "pending") {
    document.querySelector("#loading").classList.add("remove");
    document.querySelector("#pending-box").classList.remove("remove");
  }
  
}

function registerButton() {
  veriff.setParams({
    person: {
      givenName: ' ',
      lastName: ' '
    },
    vendorData: window.secretjs.address
  });
  veriff.mount();
  document.querySelector(".test-box").classList.add("remove");
  document.querySelector("#disclaimer-box").classList.remove("remove");
}
async function claimButton(){
  let contractmsg = {
    claim: {}
  };
  let tx = await contract(contractmsg);

  // Find the status in the logs
  if (tx.arrayLog) {
    const logEntry = tx.arrayLog.find(
      (log) => log.type === "message" && log.key === "result"
    );
    document.querySelector("#loading").classList.add("remove");
    document.querySelector("#claim-box").classList.add("remove");
    document.querySelector("#complete-box").classList.remove("remove");
  } else {
    console.log("test");
  }
} 

function start(){
  check_verification_status();
}

