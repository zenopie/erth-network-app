// Analytics.js
import React, { useState, useEffect } from 'react';
import { query } from '../utils/contractUtils';
import tokens from '../utils/tokens';
import { showLoadingScreen } from '../utils/uiUtils';
import './Analytics.css';

const SECONDS_IN_YEAR = 31536000;

const Analytics = ({ isKeplrConnected }) => {
    const [poolData, setPoolData] = useState([]);
    const [erthPrice, setErthPrice] = useState(null);
    const [erthTotalSupply, setErthTotalSupply] = useState(null);
    const [totalValueLocked, setTotalValueLocked] = useState(null);
    const [erthMarketCap, setErthMarketCap] = useState(null);
    const [anmlPriceUSD, setAnmlPriceUSD] = useState(null);

    useEffect(() => {
        if (!isKeplrConnected) return;

        const fetchPricesAndData = async () => {
            try {
                console.log("Fetching analytics data...");
                showLoadingScreen(true);

                // 1. Fetch token prices
                const tokenIds = Object.values(tokens)
                    .filter(token => token.coingeckoId)
                    .map(token => token.coingeckoId)
                    .join(',');
                const priceResponse = await fetch(
                    `https://api.coingecko.com/api/v3/simple/price?ids=${tokenIds}&vs_currencies=usd`
                );
                const priceData = await priceResponse.json();

                const prices = {};
                for (const tokenKey in tokens) {
                    const token = tokens[tokenKey];
                    if (token.coingeckoId && priceData[token.coingeckoId]) {
                        prices[tokenKey] = priceData[token.coingeckoId].usd;
                    }
                }

                // 2. Query ERTH total supply
                const erthTokenInfo = await query(
                    tokens.ERTH.contract,
                    tokens.ERTH.hash,
                    { token_info: {} }
                );
                const totalSupplyRaw = erthTokenInfo.token_info.total_supply;
                const totalSupply = parseInt(totalSupplyRaw) / (10 ** tokens.ERTH.decimals);
                setErthTotalSupply(totalSupply);

                // 3. Gather pool data and calculate ERTH price, TVL
                const pools = [];
                for (const tokenKey in tokens) {
                    const token = tokens[tokenKey];
                    if (
                        tokenKey !== 'ERTH' &&
                        token.poolContract &&
                        prices[tokenKey]
                    ) {
                        const { poolContract, poolHash } = token;
                        const poolStateResponse = await query(poolContract, poolHash, { query_state: {} });
                        const state = poolStateResponse.state;
                        if (state) {
                            const reserves = {
                                tokenErthReserve: parseInt(state.token_erth_reserve),
                                tokenBReserve: parseInt(state.token_b_reserve),
                            };
                            pools.push({ token: tokenKey, reserves });
                        }
                    }
                }
                setPoolData(pools);

                let totalWeightedPrice = 0;
                let totalLiquidity = 0;

                for (const pool of pools) {
                    const tokenKey = pool.token;
                    const tokenPriceUSD = prices[tokenKey];
                    const erthReserve = pool.reserves.tokenErthReserve / (10 ** tokens.ERTH.decimals);
                    const tokenReserve = pool.reserves.tokenBReserve / (10 ** tokens[tokenKey].decimals);

                    const erthPriceUSD = (tokenReserve / erthReserve) * tokenPriceUSD;
                    const poolTVL = (tokenReserve * tokenPriceUSD) + (erthReserve * erthPriceUSD);

                    pool.erthPrice = erthPriceUSD;
                    pool.tvl = poolTVL;

                    totalWeightedPrice += erthPriceUSD * poolTVL;
                    totalLiquidity += poolTVL;
                }

                const averageErthPrice = totalWeightedPrice / totalLiquidity;
                setErthPrice(averageErthPrice);
                setTotalValueLocked(totalLiquidity);

                // 4. ERTH market cap
                const marketCap = averageErthPrice * totalSupply;
                setErthMarketCap(marketCap);

                // 5. ANML price & updated TVL
                const anmlToken = tokens['ANML'];
                if (anmlToken && anmlToken.poolContract) {
                    const { poolContract, poolHash } = anmlToken;
                    const poolStateResponse = await query(poolContract, poolHash, { query_state: {} });
                    const state = poolStateResponse.state;
                    if (state) {
                        const reserves = {
                            tokenErthReserve: parseInt(state.token_erth_reserve),
                            tokenBReserve: parseInt(state.token_b_reserve),
                        };
                        const erthReserve = reserves.tokenErthReserve / (10 ** tokens.ERTH.decimals);
                        const anmlReserve = reserves.tokenBReserve / (10 ** tokens.ANML.decimals);
                        const anmlPrice = (erthReserve / anmlReserve) * averageErthPrice;
                        setAnmlPriceUSD(anmlPrice);

                        const poolTVL = erthReserve * averageErthPrice * 2;
                        const updatedTotalLiquidity = totalLiquidity + poolTVL;
                        setTotalValueLocked(updatedTotalLiquidity);

                        const anmlPoolInfo = {
                            token: 'ANML',
                            erthPrice: averageErthPrice,
                            tvl: poolTVL,
                            reserves,
                        };
                        setPoolData(prev => [anmlPoolInfo, ...prev]);
                    }
                }
            } catch (error) {
                console.error('Error fetching analytics data:', error);
            } finally {
                showLoadingScreen(false);
            }
        };

        fetchPricesAndData();
    }, [isKeplrConnected]);

    // Calculate annual inflation
    const annualTokensMinted = SECONDS_IN_YEAR * 4;
    const annualInflationRate = erthTotalSupply
        ? (annualTokensMinted / erthTotalSupply) * 100
        : null;

    return (
        <div className="analytics-page">
            <h2>Analytics</h2>
            {erthPrice && (
                <div className="analytics-price-section">
                    <div className="analytics-info">
                        <div className="analytics-row">
                            <span className="analytics-label">ERTH Price:</span>
                            <span className="analytics-value">
                                ${erthPrice.toFixed(6)}
                            </span>
                        </div>

                        {erthTotalSupply !== null ? (
                            <div className="analytics-row">
                                <span className="analytics-label">Total Supply:</span>
                                <span className="analytics-value">
                                    {erthTotalSupply.toLocaleString()} ERTH
                                </span>
                            </div>
                        ) : (
                            <div className="analytics-row">
                                <span className="analytics-label">Total Supply:</span>
                                <span className="analytics-value">Data not available</span>
                            </div>
                        )}

                        {erthMarketCap && (
                            <div className="analytics-row">
                                <span className="analytics-label">Market Cap:</span>
                                <span className="analytics-value">
                                    ${erthMarketCap.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        )}

                        {/* Inflation row */}
                        {annualInflationRate !== null && (
                            <div className="analytics-row">
                                <span className="analytics-label">Inflation Rate:</span>
                                <span className="analytics-value">
                                    {annualInflationRate.toFixed(2)}%
                                </span>
                            </div>
                        )}

                        {totalValueLocked !== null && (
                            <div className="analytics-row">
                                <span className="analytics-label">TVL:</span>
                                <span className="analytics-value">
                                    ${totalValueLocked.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        )}

                        {anmlPriceUSD && (
                            <div className="analytics-row">
                                <span className="analytics-label">ANML Price:</span>
                                <span className="analytics-value">
                                    ${anmlPriceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        )}

                        
                    </div>
                </div>
            )}

            <table className="analytics-table">
                <thead>
                    <tr>
                        <th>Pool</th>
                        <th>ERTH Price</th>
                        <th>Liquidity (USD)</th>
                    </tr>
                </thead>
                <tbody>
                    {poolData.map((pool, index) => (
                        <tr key={index}>
                            <td>{`ERTH-${pool.token}`}</td>
                            <td>${pool.erthPrice.toFixed(6)}</td>
                            <td>${pool.tvl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Analytics;
