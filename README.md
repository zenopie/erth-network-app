# ERTH Network Application

A full-stack decentralized application for the ERTH Network ecosystem that provides token management, staking, swapping, and analytics functionalities.

## Overview

ERTH Network is a blockchain-based platform built on the Secret Network that offers various decentralized finance (DeFi) capabilities including token swapping, staking, liquidity provision, and analytics tracking. This application serves as the main interface for users to interact with the ERTH ecosystem.

## Features

- **Token Swapping**: Exchange ERTH, ANML, and other tokens directly through the interface
- **Staking**: Stake ERTH tokens to earn rewards
- **Liquidity Management**: Add or remove liquidity to various token pairs
- **Analytics Dashboard**: Monitor token prices, market cap, and TVL (Total Value Locked)
- **TOTP Authentication**: Secure access with time-based one-time passwords
- **Secret AI Chat**: Interact with AI powered by Secret Network's privacy features
- **Agent Chat**: Communicate with specialized AI agents
- **Public Benefit Fund**: Interface for interacting with the network's public benefit fund
- **Deflation Fund**: Track and interact with the network's deflation mechanism
- **ANML Token Claiming**: Claim ANML tokens through the dedicated interface

## Technical Architecture

### Frontend

The frontend is built using React.js with the following structure:

- **pages/**: Main application pages (Analytics, StakeErth, SwapTokens, etc.)
- **components/**: Reusable UI components
- **utils/**: Utility functions for common operations
- **styles/**: CSS and style-related files
- **images/**: Static image assets

### Backend

The Node.js backend provides the following services:

- **API Endpoints**: RESTful services for frontend data requests
- **Blockchain Interaction**: Communication with Secret Network using secretjs
- **Analytics Management**: Collection and serving of token and market analytics
- **CORS Proxy**: Handling cross-origin requests for development

## Getting Started

### Prerequisites

- Node.js v18.20.7 or later
- npm package manager
- Secret Network wallet (for blockchain interactions)

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/zenopie/erth-mainnet-app.git
   cd erth-mainnet-app
   ```

2. Install frontend dependencies:

   ```
   npm install
   ```

3. Install server dependencies:
   ```
   cd server
   npm install
   cd ..
   ```

### Development

1. Start the frontend development server:

   ```
   npm start
   ```

   This runs the app in development mode at [http://localhost:3000](http://localhost:3000)

2. Start the backend server (in a separate terminal):
   ```
   cd server
   node server.js
   ```

### Building for Production

Build the frontend for production:

```
npm run build
```

This creates optimized production files in the `build` folder.

## Analytics Management

The application includes an analytics system that tracks token prices, market caps, and other metrics over time.

### Analytics Features

- Daily data collection at midnight
- Historical data visualization with various time ranges (1W, 1M, All)
- Price change calculation and display
- Support for multiple tokens (ERTH, ANML)

### Analytics Management Scripts

- **Reset Analytics**: `node server/reset-analytics.js` - Resets all analytics data
- **Migrate Analytics**: `node server/migrate-analytics.js` - Converts existing analytics data to new format with one entry per day

## Deployment

The application is configured for deployment using GitHub Actions. The workflow automatically:

1. Checks out the repository
2. Deploys to a remote server via SSH
3. Builds the frontend
4. Installs dependencies
5. Restarts the server using PM2

For manual deployment, follow these steps:

1. Build the frontend: `npm run build`
2. Copy the build files to your web server
3. Set up the Node.js server with PM2: `pm2 start server/server.js --name "erth-network-server"`

## Project Structure

```
erth-network-app/
├── .github/workflows/    # GitHub Actions deployment workflow
├── public/              # Static public assets
├── server/              # Backend Node.js server
│   ├── analyticsManager.js    # Analytics data management
│   ├── migrate-analytics.js   # Analytics migration script
│   ├── reset-analytics.js     # Analytics reset script
│   └── server.js        # Main server file
├── src/                 # Frontend React application
│   ├── components/      # Reusable UI components
│   ├── pages/           # Application pages
│   ├── utils/           # Utility functions
│   └── App.js           # Main React component
└── package.json         # Project dependencies and scripts
```

## License

MIT License

Copyright (c) 2023-2024 ERTH Network

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Contact

For more information, visit [https://erth.network](https://erth.network)
