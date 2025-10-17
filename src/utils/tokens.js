// Token objects with metadata
const tokens = {
  ERTH: {
    contract: undefined,
    hash: undefined,
    decimals: 6,
    logo: "/images/coin/ERTH.png",
  },
  ANML: {
    contract: undefined,
    hash: undefined,
    decimals: 6,
    logo: "/images/coin/ANML.png",
  },
  SSCRT: {
    contract: undefined,
    hash: undefined,
    decimals: 6,
    logo: "/images/coin/SSCRT.png",
    coingeckoId: "secret",
  },
};

// Populate tokens with registry data
export function populateTokens(registryTokens) {
  Object.keys(tokens).forEach(tokenName => {
    if (registryTokens[tokenName]) {
      tokens[tokenName].contract = registryTokens[tokenName].contract;
      tokens[tokenName].hash = registryTokens[tokenName].hash;
    }
  });
  console.log("Tokens populated:", tokens);
}

export default tokens;
