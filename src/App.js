import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ANMLClaim from './pages/ANMLClaim';
import SwapTokens from './pages/SwapTokens';
import ManageLP from './pages/ManageLP';
import StakeErth from './pages/StakeErth';
import PublicGoodsFund from './pages/PublicGoodsFund';
import DeflationFund from './pages/DeflationFund';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Navigate to="/anml-claim" />} />
          <Route path="/anml-claim" element={<Layout><ANMLClaim /></Layout>} />
          <Route path="/swap-tokens" element={<Layout><SwapTokens /></Layout>} />
          <Route path="/manage-lp" element={<Layout><ManageLP /></Layout>} />
          <Route path="/stake-erth" element={<Layout><StakeErth /></Layout>} />
          <Route path="/public-goods-fund" element={<Layout><PublicGoodsFund /></Layout>} />
          <Route path="/deflation-fund" element={<Layout><DeflationFund /></Layout>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
