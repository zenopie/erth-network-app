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
  XMR: {
    contract: "secret1uahwhw3rk2x8vx4963yxqw6nl8h9drk79kasfx",
    hash: "83d3a35e92363d3ef743dec1e9f2e8b3a18f2c761fe44169f11b436648a21078",
    decimals: 12,
    logo: "/images/coin/XMR.png",
    coingeckoId: "monero",
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
