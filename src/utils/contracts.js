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
  weekly_airdrop: {
    contract: undefined,
    hash: undefined,
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
