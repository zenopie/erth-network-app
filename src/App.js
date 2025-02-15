import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ANMLClaim from './pages/ANMLClaim';
import Analytics from './pages/Analytics';
import SwapTokens from './pages/SwapTokens';
import ManageLP from './pages/ManageLP';
import StakeErth from './pages/StakeErth';
import PublicBenefitFund from './pages/PublicBenefitFund';
import DeflationFund from './pages/DeflationFund';
import SecretAIChat from './pages/SecretAIChat';
import TOTPAuth from './pages/TOTPAuth';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Navigate to="/anml-claim" />} />
          <Route path="/anml-claim" element={<Layout><ANMLClaim /></Layout>} />
          <Route path="/analytics" element={<Layout><Analytics /></Layout>} />
          <Route path="/swap-tokens" element={<Layout><SwapTokens /></Layout>} />
          <Route path="/manage-lp" element={<Layout><ManageLP /></Layout>} />
          <Route path="/stake-erth" element={<Layout><StakeErth /></Layout>} />
          <Route path="/public-benefit-fund" element={<Layout><PublicBenefitFund /></Layout>} />
          <Route path="/deflation-fund" element={<Layout><DeflationFund /></Layout>} />
          <Route path="/ai-chat" element={<Layout><SecretAIChat /></Layout>} />
          <Route path="/totp-auth" element={<Layout><TOTPAuth /></Layout>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
