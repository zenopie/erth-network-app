// Earth chain connection settings.
//
// Earth is a sovereign Cosmos SDK chain: native bank denoms, native x/staking,
// and the custom x/dex, x/allocation and x/personhood modules. There are no
// contracts, no SNIP-20 tokens, no viewing keys and no query permits — every
// balance is public and read straight off the LCD.

const isDev = import.meta.env.DEV;

// In dev, vite proxies /lcd -> http://localhost:1317 (see vite.config.js) so a
// local `ignite chain serve` works without CORS. In production these default to
// the public endpoints, which the deployed bundle relies on: the image is built
// without VITE_ vars, so whatever is written here is what ships.
export const EARTH_LCD_URL = isDev
  ? "/lcd"
  : (import.meta.env.VITE_EARTH_LCD ?? "https://lcd.erth.network");

export const EARTH_CHAIN_ID = import.meta.env.VITE_EARTH_CHAIN_ID ?? "earth-1";

// CometBFT RPC. Keplr wants it, and the explorer uses it for the one read the
// LCD has no equivalent for: a range of blocks in a single request. In dev,
// vite proxies /rpc -> localhost:26657. Everything else goes through the LCD,
// and the explorer degrades to per-height LCD reads when this is unreachable.
//
// Defaulting this to "" shipped a build that could not connect at all:
// suggestChain refuses a chain whose rpc is empty, so Keplr never registered
// Earth and every connection failed before it reached the chain. The LCD had a
// real default and this did not, which made the failure look like a Keplr
// problem rather than a missing build variable.
export const EARTH_RPC_URL = isDev
  ? "/rpc"
  : (import.meta.env.VITE_EARTH_RPC ?? "https://rpc.erth.network");

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
