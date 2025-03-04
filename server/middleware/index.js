const bodyParser = require("body-parser");
const corsProxy = require("cors-anywhere");

function setupMiddleware(app) {
  // Middleware to parse JSON requests
  app.use(bodyParser.json());

  // Set CORS headers
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });
}

function setupCorsProxy(port = 8080) {
  // Create CORS proxy server
  const host = process.env.HOST || "0.0.0.0";
  corsProxy
    .createServer({
      originWhitelist: [], // Allow all origins
      requireHeader: ["origin", "x-requested-with"],
      removeHeaders: ["cookie", "cookie2"],
    })
    .listen(port, host, () => {
      console.log(`CORS Anywhere proxy running on ${host}:${port}`);
    });
}

module.exports = {
  setupMiddleware,
  setupCorsProxy,
};
