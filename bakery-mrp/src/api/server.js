'use strict';

const http = require('node:http');
const { createRouter } = require('./router');
const { registerRoutes } = require('./routes');
const { createStore } = require('../services/store');

/**
 * createApp(store?) -> http.Server (ยังไม่ listen)
 * แยกจาก listen() เพื่อให้เทสสร้าง server แล้วสุ่ม port เองได้ (ดู test/api.test.js)
 */
function createApp(store = createStore()) {
  const router = createRouter();
  registerRoutes(router, store);
  return http.createServer((req, res) => router.handle(req, res));
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const server = createApp();
  server.listen(port, () => {
    console.log(`Bakery Purchasing/MRP/BOM API listening on http://localhost:${port}`);
  });
}

module.exports = { createApp };
