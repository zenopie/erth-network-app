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
                console.log("test start");
                // Start loading

                // Step 1: Get prices from Coingecko
                const tokenIds = Object.values(tokens)
                    .filter(token => token.coingeckoId)
                    .map(token => token.coingeckoId)
                    .join(',')

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
                setErthTotalSupply(totalSupply);

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
                    const tokenPrice = prices[tokenKey];
                    const R_ERTH = reserves.tokenErthReserve / (10 ** tokens.ERTH.decimals);
                    const R_B = reserves.tokenBReserve / (10 ** tokens[tokenKey].decimals);
                    const P_B_USD = tokenPrice;

                    const P_ERTH_USD = (R_B / R_ERTH) * P_B_USD;

                    const TVL = (R_B * P_B_USD) + (R_ERTH * P_ERTH_USD);
                    pool.erthPrice = P_ERTH_USD;
                    pool.tvl = TVL;

                    totalWeightedPrice += P_ERTH_USD * TVL;
                    totalLiquidity += TVL;
                }

                const averageErthPrice = totalWeightedPrice / totalLiquidity;
                setErthPrice(averageErthPrice);

                // Calculate ERTH Market Cap
               
                console.log('averageErthPrice:', averageErthPrice, 'Type:', typeof averageErthPrice);


                console.log('erthTotalSupply:', erthTotalSupply, 'Type:', typeof erthTotalSupply);

                const averageErthPriceNum = parseFloat(averageErthPrice);
                const erthTotalSupplyNum = parseFloat(totalSupply);

                const marketCap = averageErthPriceNum * erthTotalSupplyNum;
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
    }, );

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