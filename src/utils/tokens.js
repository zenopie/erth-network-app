import { getRegistryData } from './contractUtils';

// Token metadata that doesn't come from registry
const tokenMetadata = {
  ERTH: {
    decimals: 6,
    logo: "/images/coin/ERTH.png",
  },
  ANML: {
    decimals: 6,
    logo: "/images/coin/ANML.png",
  },
  SSCRT: {
    decimals: 6,
    logo: "/images/coin/SSCRT.png",
    coingeckoId: "secret",
  },
};

// Get tokens with dynamic data from registry
function getTokens() {
  const registry = getRegistryData();
  const tokens = {};

  // Merge registry data with metadata
  Object.keys(tokenMetadata).forEach(tokenName => {
    const registryToken = registry.tokens?.[tokenName];
    const metadata = tokenMetadata[tokenName];

    tokens[tokenName] = {
      contract: registryToken?.contract || undefined,
      hash: registryToken?.hash || undefined,
      ...metadata
    };
  });

  return tokens;
}

// Export as a Proxy to always get fresh data
const tokens = new Proxy({}, {
  get(_target, prop) {
    const currentTokens = getTokens();
    // Return token with metadata or empty object if token not found
    if (currentTokens[prop]) {
      return currentTokens[prop];
    }
    // Fallback: return metadata only if it exists
    if (tokenMetadata[prop]) {
      return {
        contract: undefined,
        hash: undefined,
        ...tokenMetadata[prop]
      };
    }
    return { contract: undefined, hash: undefined };
  },
  ownKeys() {
    return Object.keys(tokenMetadata);
  },
  getOwnPropertyDescriptor(_target, _prop) {
    return {
      enumerable: true,
      configurable: true,
    };
  }
});

export default tokens;
