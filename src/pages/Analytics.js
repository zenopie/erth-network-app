// Analytics.js
import React, { useState, useEffect } from 'react';
import { query } from '../utils/contractUtils';
import tokens from '../utils/tokens';
import { showLoadingScreen } from '../utils/uiUtils';

const Analytics = () => {
    const [poolData, setPoolData] = useState([]);
    const [erthPrice, setErthPrice] = useState(null);
    const [erthTotalSupply, setErthTotalSupply] = useState(null);
    const [erthMarketCap, setErthMarketCap] = useState(null);

    useEffect(() => {
        const fetchPricesAndData = async () => {
            try {
                console.log("Fetching analytics data...");
                // Start loading
                showLoadingScreen(true);

                // Step 1: Get prices from Coingecko
                const tokenIds = Object.values(tokens)
                    .filter(token => token.coingeckoId)
                    .map(token => token.coingeckoId)
                    .join(',');

                const priceResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${tokenIds}&vs_currencies=usd`);
                const priceData = await priceResponse.json();

                const prices = {};
                for (const tokenKey in tokens) {
                    const token = tokens[tokenKey];
                    if (token.coingeckoId && priceData[token.coingeckoId]) {
                        prices[tokenKey] = priceData[token.coingeckoId].usd;
                    }
                }

                // Query total supply of ERTH
                const erthTokenInfo = await query(
                    tokens.ERTH.contract,
                    tokens.ERTH.hash,
                    { token_info: {} }
                );

                const totalSupplyRaw = erthTokenInfo.token_info.total_supply;
                const totalSupply = parseInt(totalSupplyRaw) / (10 ** tokens.ERTH.decimals);
                console.log('totalSupply:', totalSupply, 'Type:', typeof totalSupply);
                setErthTotalSupply(totalSupply); // Update state

                // For each ERTH pair, get reserves
                const pools = [];
                for (const tokenKey in tokens) {
                    const token = tokens[tokenKey];
                    if (
                        tokenKey !== 'ERTH' &&
                        token.poolContract &&
                        prices[tokenKey] // Ensure we have a price for this token
                    ) {
                        // Token is paired with ERTH and has a price
                        const poolContract = token.poolContract;
                        const poolHash = token.poolHash;
                        const poolStateResponse = await query(poolContract, poolHash, { query_state: {} });
                        const state = poolStateResponse.state;
                        if (state) {
                            const reserves = {
                                tokenErthReserve: parseInt(state.token_erth_reserve),
                                tokenBReserve: parseInt(state.token_b_reserve),
                            };
                            const poolInfo = {
                                token: tokenKey,
                                reserves,
                            };
                            pools.push(poolInfo);
                        }
                    }
                }
                setPoolData(pools);

                // Calculate ERTH price per pool
                let totalWeightedPrice = 0;
                let totalLiquidity = 0;
                for (const pool of pools) {
                    const tokenKey = pool.token;
                    const reserves = pool.reserves;
                    const tokenPriceUSD = prices[tokenKey]; // Price of the paired token in USD

                    // Adjust the reserves by dividing by 10^decimals to get the actual amounts
                    const erthReserve = reserves.tokenErthReserve / (10 ** tokens.ERTH.decimals);
                    const tokenReserve = reserves.tokenBReserve / (10 ** tokens[tokenKey].decimals);

                    // Calculate the ERTH price in USD using the ratio of reserves and the paired token's price
                    const erthPriceUSD = (tokenReserve / erthReserve) * tokenPriceUSD;

                    // Calculate the Total Value Locked (TVL) in USD for the pool
                    const poolTVL = (tokenReserve * tokenPriceUSD) + (erthReserve * erthPriceUSD);

                    // Store the calculated ERTH price and TVL in the pool object for later use
                    pool.erthPrice = erthPriceUSD;
                    pool.tvl = poolTVL;

                    // Accumulate the weighted ERTH price and total liquidity for averaging later
                    totalWeightedPrice += erthPriceUSD * poolTVL;
                    totalLiquidity += poolTVL;
                }

                const averageErthPrice = totalWeightedPrice / totalLiquidity;
                setErthPrice(averageErthPrice);

                // Calculate ERTH Market Cap using local totalSupply
                console.log('averageErthPrice:', averageErthPrice, 'Type:', typeof averageErthPrice);
                console.log('totalSupply:', totalSupply, 'Type:', typeof totalSupply);

                const marketCap = averageErthPrice * totalSupply;
                console.log('marketCap:', marketCap, 'Type:', typeof marketCap);
                setErthMarketCap(marketCap);

            } catch (error) {
                console.error('Error fetching analytics data:', error);
            } finally {
                // End loading
                showLoadingScreen(false);
            }
        };

        fetchPricesAndData();
    }, []); // Empty dependency array

    return (
        <div className="analytics-page">
            <h2>Analytics</h2>
            {erthPrice && (
                <div className="erth-price-section">
                    <h3>Average ERTH Price: ${erthPrice.toFixed(6)}</h3>
                    {erthTotalSupply !== null ? (
                        <h3>Total Supply: {erthTotalSupply.toLocaleString()} ERTH</h3>
                    ) : (
                        <h3>Total Supply: Data not available</h3>
                    )}
                    {erthMarketCap && (
                        <h3>Market Cap: ${erthMarketCap.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h3>
                    )}
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
                            <td>${pool.tvl.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Analytics;
