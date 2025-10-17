import { getRegistryData } from './contractUtils';

// Get contracts with dynamic data from registry
function getContracts() {
  const registry = getRegistryData();
  return registry.contracts || {};
}

// Export as a Proxy to always get fresh data
const contracts = new Proxy({}, {
  get(_target, prop) {
    const currentContracts = getContracts();
    // Return empty object if contract not found to avoid undefined errors
    return currentContracts[prop] || { contract: undefined, hash: undefined };
  },
  ownKeys() {
    return Object.keys(getContracts());
  },
  getOwnPropertyDescriptor(_target, _prop) {
    return {
      enumerable: true,
      configurable: true,
    };
  }
});

export default contracts;
