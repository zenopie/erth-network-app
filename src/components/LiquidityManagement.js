import React, { useState } from 'react';
import './LiquidityManagement.css';

const LiquidityManagement = ({ toggleManageLiquidity }) => {
    const [activeTab, setActiveTab] = useState('Provide');

    const openTab = (event, tabName) => {
        setActiveTab(tabName);
    };

    return (
            
            <div className="liquidity-management-box">
            <h2>Manage Liquidity</h2>
            <div className="liquidity-management-close-button" onClick={toggleManageLiquidity}>X</div>
                <div className="liquidity-management-tab">
                    <button
                        className={`tablinks ${activeTab === 'Provide' ? 'active' : ''}`}
                        onClick={(e) => openTab(e, 'Provide')}
                    >
                        Provide
                    </button>
                    <button
                        className={`tablinks ${activeTab === 'Withdraw' ? 'active' : ''}`}
                        onClick={(e) => openTab(e, 'Withdraw')}
                    >
                        Withdraw
                    </button>
                    <button
                        className={`tablinks ${activeTab === 'Stake' ? 'active' : ''}`}
                        onClick={(e) => openTab(e, 'Stake')}
                    >
                        Stake
                    </button>
                </div>

                {activeTab === 'Provide' && (
                    <div id="Provide" className="liquidity-management-tabcontent">
                        <div className="liquidity-management-input-group">
                            <div className="liquidity-management-label-wrapper">
                                <label htmlFor="provide-erth" className="liquidity-management-input-label">ERTH Amount</label>
                            </div>
                            <div className="liquidity-management-input-wrapper">
                                <img id="provide-erth-logo" src="/images/logo.png" alt="ERTH Token" className="liquidity-management-input-logo" />
                                <input type="text" id="provide-erth" placeholder="Amount to Provide" className="liquidity-management-input" />
                            </div>
                        </div>

                        <div className="liquidity-management-input-group">
                            <div className="liquidity-management-label-wrapper">
                                <label htmlFor="provide-anml" className="liquidity-management-input-label">ANML Amount</label>
                            </div>
                            <div className="liquidity-management-input-wrapper">
                                <img id="provide-anml-logo" src="/images/anml.png" alt="ANML Token" className="liquidity-management-input-logo" />
                                <input type="text" id="provide-anml" placeholder="Amount to Provide" className="liquidity-management-input" />
                            </div>
                        </div>

                        <button onClick={() => console.log("Provide Liquidity")} className="liquidity-management-button">Provide Liquidity</button>
                        <div id="provide-result" className="liquidity-management-result"></div>

                        <details className="liquidity-management-expandable-info">
                            <summary>
                                <i className="bx bx-chevron-down liquidity-management-chevron-icon"></i>
                            </summary>
                            <div className="liquidity-management-info-display">
                                <div className="liquidity-management-info-row">
                                    <span className="liquidity-management-info-label">Pool Reserve ERTH:</span>
                                    <span className="liquidity-management-info-value" id="pool-erth-reserve">-</span>
                                </div>
                                <div className="liquidity-management-info-row">
                                    <span className="liquidity-management-info-label">Pool Reserve ANML:</span>
                                    <span className="liquidity-management-info-value" id="pool-anml-reserve">-</span>
                                </div>
                                <div className="liquidity-management-info-row">
                                    <span className="liquidity-management-info-label">Your Pool Share:</span>
                                    <span className="liquidity-management-info-value" id="pool-share">-</span>
                                </div>
                            </div>
                        </details>
                    </div>
                )}

                {activeTab === 'Withdraw' && (
                    <div id="Withdraw" className="liquidity-management-tabcontent">
                        <div className="liquidity-management-input-group">
                            <div className="liquidity-management-label-wrapper">
                                <label htmlFor="withdraw-amount" className="liquidity-management-input-label">Withdraw Amount</label>
                            </div>
                            <div className="liquidity-management-input-wrapper">
                                <select id="withdraw-type" className="liquidity-managemen-input">
                                    <option value="staked">Staked</option>
                                    <option value="unstaked">Unstaked</option>
                                </select>
                                <input type="text" id="withdraw-amount" placeholder="Amount to Withdraw" className="liquidity-management-input" />
                            </div>
                        </div>

                        <button onClick={() => console.log("Withdraw Liquidity")} className="liquidity-management-button">Withdraw Liquidity</button>
                        <div id="withdraw-result" className="liquidity-management-result"></div>

                        <details className="liquidity-management-expandable-info">
                            <summary>
                                <i className="bx bx-chevron-down liquidity-management-chevron-icon"></i>
                            </summary>
                            <div className="liquidity-management-info-display">
                                <div className="liquidity-management-info-row">
                                    <span className="liquidity-management-info-label">Your Staked LP Tokens:</span>
                                    <span className="liquidity-management-info-value" id="staked-lp">-</span>
                                </div>
                                <div className="liquidity-management-info-row">
                                    <span className="liquidity-management-info-label">Your Unstaked LP Tokens:</span>
                                    <span className="liquidity-management-info-value" id="unstaked-lp">-</span>
                                </div>
                                <div className="liquidity-management-info-row">
                                    <span className="liquidity-management-info-label">Expected ERTH:</span>
                                    <span className="liquidity-management-info-value" id="withdraw-erth">-</span>
                                </div>
                                <div className="liquidity-management-info-row">
                                    <span className="liquidity-management-info-label">Expected ANML:</span>
                                    <span className="liquidity-management-info-value" id="withdraw-anml">-</span>
                                </div>
                            </div>
                        </details>
                    </div>
                )}

                {activeTab === 'Stake' && (
                    <div id="Stake" className="liquidity-management-tabcontent">
                        <div className="liquidity-management-input-group">
                            <div className="liquidity-management-label-wrapper">
                                <label htmlFor="stake-amount" className="liquidity-management-input-label">Stake Amount</label>
                            </div>
                            <div className="liquidity-management-input-wrapper">
                                <input type="text" id="stake-amount" placeholder="Amount to Stake" className="liquidity-management-input" />
                            </div>
                        </div>

                        <button onClick={() => console.log("Stake Liquidity")} className="liquidity-management-button">Stake Liquidity</button>
                        <div id="stake-result" className="liquidity-management-result"></div>

                        <details className="liquidity-management-expandable-info">
                            <summary>
                                <i className="bx bx-chevron-down liquidity-management-chevron-icon"></i>
                            </summary>
                            <div className="liquidity-management-info-display">
                                <div className="liquidity-management-info-row">
                                    <span className="liquidity-management-info-label">Your Staked LP Tokens:</span>
                                    <span className="liquidity-management-info-value" id="stake-staked-lp">-</span>
                                </div>
                                <div className="liquidity-management-info-row">
                                    <span className="liquidity-management-info-label">Your Unstaked LP Tokens:</span>
                                    <span className="liquidity-management-info-value" id="stake-unstaked-lp">-</span>
                                </div>
                            </div>
                        </details>
                    </div>
                )}
            </div>
    );
};

export default LiquidityManagement;
