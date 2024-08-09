

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
  showLoadingScreen(true);
  let querymsg = {
      registration_status: {
          address: secretjs.address
      }
  };
  let anml_status = "not_verified";
  let contract_value = await query(REGISTRATION_CONTRACT, REGISTRATION_HASH, querymsg);
  if (contract_value.registration_status == true) {
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
      showLoadingScreen(false);
      document.querySelector("#claim-box").classList.remove("remove");
  } else if (anml_status == "claimed") {
      document.querySelector("#complete-box").classList.remove("remove");
      showLoadingScreen(false);
  } else if (anml_status == "not_verified") {
      showLoadingScreen(false);
      document.querySelector("#register-box").classList.remove("remove");
  } else if (anml_status == "pending") {
      showLoadingScreen(false);
      document.querySelector("#pending-box").classList.remove("remove");
  }
  console.log("Exiting check_verification_status");
}


function registerButton() {
  console.log("Register button clicked");
  showLoadingScreen(true);
  veriff.setParams({
      person: {
          givenName: ' ',
          lastName: ' '
      },
      vendorData: window.secretjs.address
  });
  veriff.mount();
  
  document.querySelector("#register-box").classList.add("remove");
  document.querySelector("#disclaimer-box").classList.remove("remove");
  showLoadingScreen(false);
}


async function claimButton() {
  console.log("Claim button clicked");
  showLoadingScreen(true);
  let contractmsg = {
      claim: {}
  };
  let tx = await contract(REGISTRATION_CONTRACT, REGISTRATION_HASH, contractmsg);

  if (tx.arrayLog) {
      const logEntry = tx.arrayLog.find(
          (log) => log.type === "message" && log.key === "result"
      );
      document.querySelector('#claim-box').classList.add('remove');
      document.querySelector("#complete-box").classList.remove("remove");
  } else {
      console.log("claim error");
  }
  showLoadingScreen(false);
}

function start() {
  console.log("Starting verification status check");
  check_verification_status();
}
