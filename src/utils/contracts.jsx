// Contract objects - populated from registry
const contracts = {
  exchange: {
    contract: undefined,
    hash: undefined,
  },
  staking: {
    contract: undefined,
    hash: undefined,
  },
  airdrop: {
    contract: undefined,
    hash: undefined,
  },
  registration: {
    contract: undefined,
    hash: undefined,
  },
  xmr_bridge: {
    contract: "secret130nl6yfwuzjmnuknwfccq7jl8qekl4kcz0ppap",
    hash: "91bed2b7eac8ba8e29c89efc32fcf0d0d0352d75f945da9035bc2ac4fa1ac14d",
  },
};

// Populate contracts with registry data
export function populateContracts(registryContracts) {
  Object.keys(registryContracts).forEach(contractName => {
    if (!contracts[contractName]) {
      contracts[contractName] = {};
    }
    contracts[contractName].contract = registryContracts[contractName].contract;
    contracts[contractName].hash = registryContracts[contractName].hash;
  });
  console.log("Contracts populated:", contracts);
}

export default contracts;
