// Earth chain connection settings.
//
// Earth is a sovereign Cosmos SDK chain: native bank denoms, native x/staking,
// and the custom x/dex, x/allocation and x/personhood modules. There are no
// contracts, no SNIP-20 tokens, no viewing keys and no query permits — every
// balance is public and read straight off the LCD.

const isDev = import.meta.env.DEV;

// In dev, vite proxies /lcd -> http://localhost:1317 (see vite.config.js) so a
// local `ignite chain serve` works without CORS. In production this must point
// at a public LCD (cosmos gRPC-gateway) for the earth chain.
// TODO: set VITE_EARTH_LCD to the real endpoint before deploying.
export const EARTH_LCD_URL = isDev
  ? "/lcd"
  : (import.meta.env.VITE_EARTH_LCD ?? "https://lcd.erth.network");

export const EARTH_CHAIN_ID = import.meta.env.VITE_EARTH_CHAIN_ID ?? "earth";

// CometBFT RPC. Keplr wants it, and the explorer uses it for the one read the
// LCD has no equivalent for: a range of blocks in a single request. In dev,
// vite proxies /rpc -> localhost:26657. Everything else goes through the LCD,
// and the explorer degrades to per-height LCD reads when this is unreachable.
export const EARTH_RPC_URL = isDev ? "/rpc" : (import.meta.env.VITE_EARTH_RPC ?? "");

export const ADDRESS_PREFIX = "earth";

// ERTH is the staking/hub coin; ANML is the proof-of-personhood coin.
export const UERTH = "uerth";
export const UANML = "uanml";

// LP shares for a dex pool are an ordinary bank denom.
export const lpDenom = (poolId) => `dexlp/${poolId}`;

// Gas price paid in ERTH. Earth has no separate fee token.
export const GAS_PRICE = `0.025${UERTH}`;

/**
 * Keplr chain registration. Earth is not in Keplr's built-in registry, so the
 * app has to suggest it before `enable()` will work.
 */
export const earthChainInfo = {
  chainId: EARTH_CHAIN_ID,
  chainName: "Earth Network",
  rpc: EARTH_RPC_URL,
  rest: EARTH_LCD_URL,
  bip44: { coinType: 118 },
  bech32Config: {
    bech32PrefixAccAddr: ADDRESS_PREFIX,
    bech32PrefixAccPub: `${ADDRESS_PREFIX}pub`,
    bech32PrefixValAddr: `${ADDRESS_PREFIX}valoper`,
    bech32PrefixValPub: `${ADDRESS_PREFIX}valoperpub`,
    bech32PrefixConsAddr: `${ADDRESS_PREFIX}valcons`,
    bech32PrefixConsPub: `${ADDRESS_PREFIX}valconspub`,
  },
  currencies: [
    { coinDenom: "ERTH", coinMinimalDenom: UERTH, coinDecimals: 6 },
    { coinDenom: "ANML", coinMinimalDenom: UANML, coinDecimals: 6 },
  ],
  feeCurrencies: [
    {
      coinDenom: "ERTH",
      coinMinimalDenom: UERTH,
      coinDecimals: 6,
      gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 },
    },
  ],
  stakeCurrency: { coinDenom: "ERTH", coinMinimalDenom: UERTH, coinDecimals: 6 },
};
