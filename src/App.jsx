import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { WalletProvider } from './contexts/WalletContext';
import { LoadingProvider } from './contexts/LoadingContext';
import Layout from './components/Layout';
import ANMLClaim from './pages/ANMLClaim';
import SwapTokens from './pages/SwapTokens';
import Markets from './pages/Markets';
import StakeErth from './pages/StakeErth';
import PublicBenefitFund from './pages/PublicBenefitFund';
import DeflationFund from './pages/DeflationFund';
import TransactionLogs from './pages/TransactionLogs';
import PrivacyPolicy from './pages/PrivacyPolicy';
import WeeklyAirdropClaim from './pages/WeeklyAirdropClaim';
import Bridge from './pages/Bridge';
import './App.css';

function App() {
  return (
    <Router>
      <WalletProvider>
        <LoadingProvider>
          <div className="App">
            <Routes>
              <Route path="/" element={<Navigate to="/anml-claim" />} />
              <Route path="/anml-claim" element={<Layout><ANMLClaim /></Layout>} />
              <Route path="/airdrop" element={<Layout><WeeklyAirdropClaim /></Layout>} />
              <Route path="/swap-tokens" element={<Layout><SwapTokens /></Layout>} />
              <Route path="/markets" element={<Layout><Markets /></Layout>} />
              <Route path="/stake-erth" element={<Layout><StakeErth /></Layout>} />
              <Route path="/public-benefit-fund" element={<Layout><PublicBenefitFund /></Layout>} />
              <Route path="/deflation-fund" element={<Layout><DeflationFund /></Layout>} />
              <Route path="/transaction-logs" element={<Layout><TransactionLogs /></Layout>} />
              <Route path="/privacy-policy" element={<Layout><PrivacyPolicy /></Layout>} />
              <Route path="/bridge" element={<Layout><Bridge /></Layout>} />
            </Routes>
          </div>
        </LoadingProvider>
      </WalletProvider>
    </Router>
  );
}

export default App;
