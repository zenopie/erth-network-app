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
import PrivacyPolicy from './pages/PrivacyPolicy';
import Explorer from './pages/Explorer';
import ExplorerBlock from './pages/ExplorerBlock';
import ExplorerTx from './pages/ExplorerTx';
import ExplorerAccount from './pages/ExplorerAccount';
import ExplorerValidators from './pages/ExplorerValidators';
import ExplorerRegistrations from './pages/ExplorerRegistrations';
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
              <Route path="/swap-tokens" element={<Layout><SwapTokens /></Layout>} />
              <Route path="/markets" element={<Layout><Markets /></Layout>} />
              <Route path="/stake-erth" element={<Layout><StakeErth /></Layout>} />
              <Route path="/public-benefit-fund" element={<Layout><PublicBenefitFund /></Layout>} />
              <Route path="/deflation-fund" element={<Layout><DeflationFund /></Layout>} />
              <Route path="/privacy-policy" element={<Layout><PrivacyPolicy /></Layout>} />
              <Route path="/explorer" element={<Layout><Explorer /></Layout>} />
              <Route path="/explorer/registrations" element={<Layout><ExplorerRegistrations /></Layout>} />
              <Route path="/explorer/validators" element={<Layout><ExplorerValidators /></Layout>} />
              <Route path="/explorer/block/:height" element={<Layout><ExplorerBlock /></Layout>} />
              <Route path="/explorer/tx/:hash" element={<Layout><ExplorerTx /></Layout>} />
              <Route path="/explorer/account/:address" element={<Layout><ExplorerAccount /></Layout>} />
            </Routes>
          </div>
        </LoadingProvider>
      </WalletProvider>
    </Router>
  );
}

export default App;
