'use strict';

const { CircularBomError } = require('../engine/circularCheck');
const { HttpError } = require('./router');
const { authenticate } = require('../auth/users');
const { sign } = require('../auth/token');

/**
 * ลงทะเบียน Route ทั้งหมดของ Phase 1 API พร้อม RBAC ตาม STEP 38:
 *   ADMIN       เข้าถึงทุกอย่าง (ผ่านทุก route โดยอัตโนมัติ ดู router.js)
 *   PURCHASING  Forecast, MRP, BOM, Material/Supplier (read), PO (สร้าง+ดู) — ไม่รับสินค้า
 *   WAREHOUSE   ดู PO, รับสินค้า (Receiving), ดู Outstanding — ไม่แตะ Forecast/BOM
 *   MANAGEMENT  Dashboard, Reports, ดูข้อมูลอย่างเดียวทุกโมดูล ห้ามแก้ Master Data
 */
function registerRoutes(router, store) {
  // ---------------- Auth ----------------
  router.post('/auth/login', async ({ body }) => {
    requireFields(body, ['username', 'password']);
    const user = authenticate(body.username, body.password);
    if (!user) throw new HttpError(401, 'Username หรือ Password ไม่ถูกต้อง');
    const token = sign(user);
    return { status: 200, body: { token, user } };
  }); // ไม่ระบุ roles = Public

  router.get('/auth/me', async ({ user }) => ({ status: 200, body: user }), { roles: 'AUTH' });

  // ---------------- Master Data (ทุก Role ที่ Login แล้วอ่านได้) ----------------
  const READ_ALL = ['PURCHASING', 'WAREHOUSE', 'MANAGEMENT'];
  router.get('/products', async () => ({ status: 200, body: store.products }), { roles: READ_ALL });
  router.get('/materials', async () => ({ status: 200, body: store.materials }), { roles: READ_ALL });
  router.get('/suppliers', async () => ({ status: 200, body: store.suppliers }), { roles: READ_ALL });

  // ---------------- Forecast (PURCHASING เขียน, MANAGEMENT อ่าน) ----------------
  router.post('/forecast', async ({ body }) => {
    requireFields(body, ['year', 'month', 'productId', 'quantity']);
    const forecast = store.upsertForecast(body);
    return { status: 201, body: forecast };
  }, { roles: ['PURCHASING'] });

  router.post('/forecast/adjustment', async ({ body }) => {
    requireFields(body, ['year', 'month', 'productId', 'additionalQty']);
    const adjustment = store.addForecastAdjustment(body);
    return { status: 201, body: adjustment };
  }, { roles: ['PURCHASING'] });

  router.get('/forecast', async ({ query }) => {
    requireFields(query, ['year', 'month']);
    return { status: 200, body: store.listForecast(query.year, query.month) };
  }, { roles: ['PURCHASING', 'MANAGEMENT'] });

  // ---------------- MRP (อ่านได้: PURCHASING, MANAGEMENT) ----------------
  router.get('/mrp', async ({ query }) => {
    requireFields(query, ['year', 'month']);
    const asOfDate = query.asOfDate || `${query.year}-${String(query.month).padStart(2, '0')}-01`;
    const result = store.calculateMrpForPeriod(query.year, query.month, asOfDate);
    return { status: 200, body: result };
  }, { roles: ['PURCHASING', 'MANAGEMENT'] });

  // ---------------- Dashboard (PURCHASING, MANAGEMENT) ----------------
  router.get('/dashboard/purchasing', async ({ query }) => {
    const { year, month, asOfDate } = resolvePeriod(query);
    return { status: 200, body: store.getDashboardPurchasing(year, month, asOfDate) };
  }, { roles: ['PURCHASING', 'MANAGEMENT'] });

  router.get('/dashboard/executive', async ({ query }) => {
    const { year, month, asOfDate } = resolvePeriod(query);
    return { status: 200, body: store.getDashboardExecutive(year, month, asOfDate) };
  }, { roles: ['PURCHASING', 'MANAGEMENT'] });

  // ---------------- BOM (อ่าน: PURCHASING+MANAGEMENT, เขียน: PURCHASING เท่านั้น) ----------------
  router.get('/bom/:productId', async ({ params, query }) => {
    const asOfDate = query.asOfDate || new Date().toISOString().slice(0, 10);
    const tree = store.getBomTree(params.productId, asOfDate);
    if (!tree) throw new HttpError(404, `ไม่พบ BOM Active ของ ${params.productId} ณ ${asOfDate}`);
    return { status: 200, body: tree };
  }, { roles: ['PURCHASING', 'MANAGEMENT'] });

  router.get('/bom/where-used/:type/:id', async ({ params }) => {
    return { status: 200, body: store.whereUsed(params.type, params.id) };
  }, { roles: ['PURCHASING', 'MANAGEMENT'] });

  router.post('/bom/:productId/detail', async ({ params, body, query }) => {
    requireFields(body, ['componentType', 'componentId', 'quantity']);
    const asOfDate = query.asOfDate || new Date().toISOString().slice(0, 10);
    try {
      const bom = store.addBomDetail(params.productId, body, asOfDate);
      return { status: 201, body: bom };
    } catch (err) {
      if (err instanceof CircularBomError) throw new HttpError(400, err.message);
      throw err;
    }
  }, { roles: ['PURCHASING'] });

  router.delete('/bom/:productId/detail/:bomDetailId', async ({ params }) => {
    const bom = store.removeBomDetail(params.productId, params.bomDetailId);
    return { status: 200, body: bom };
  }, { roles: ['PURCHASING'] });

  // ---------------- Purchase Order (สร้าง: PURCHASING, ดู: PURCHASING+WAREHOUSE+MANAGEMENT) ----------------
  router.post('/po', async ({ body }) => {
    requireFields(body, ['supplierId', 'expectedDeliveryDate', 'lines']);
    const po = store.createPurchaseOrder(body);
    return { status: 201, body: po };
  }, { roles: ['PURCHASING'] });

  router.get('/po', async () => {
    return { status: 200, body: store.listPurchaseOrdersTracking() };
  }, { roles: ['PURCHASING', 'WAREHOUSE', 'MANAGEMENT'] });

  router.get('/po/:id', async ({ params }) => {
    return { status: 200, body: store.getPurchaseOrder(params.id) };
  }, { roles: ['PURCHASING', 'WAREHOUSE', 'MANAGEMENT'] });

  // ---------------- Receiving (เฉพาะ WAREHOUSE) ----------------
  router.post('/po/:id/receive', async ({ params, body }) => {
    requireFields(body, ['lines']);
    const po = store.receiveGoods(params.id, body.lines);
    return { status: 200, body: po };
  }, { roles: ['WAREHOUSE'] });
}

function requireFields(obj, fields) {
  const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length > 0) {
    throw new HttpError(400, `ขาดข้อมูลที่จำเป็น: ${missing.join(', ')}`);
  }
}

/** ค่า default ของ Dashboard: เดือน/ปีปัจจุบันของ Server ถ้าไม่ระบุ query มา */
function resolvePeriod(query) {
  const now = new Date();
  const year = query.year || now.getFullYear();
  const month = query.month || now.getMonth() + 1;
  const asOfDate = query.asOfDate || `${year}-${String(month).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return { year, month, asOfDate };
}

module.exports = { registerRoutes };
