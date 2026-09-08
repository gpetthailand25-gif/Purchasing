'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/api/server');

async function withServer(fn) {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const tokens = new Map(); // base -> token ปัจจุบันของ session ทดสอบนี้ (เปลี่ยน role ได้ด้วย login() ซ้ำ)

/** Login แล้วจำ token ไว้ให้ req() ของ base นี้ใช้อัตโนมัติในคำเรียกถัดไป */
async function login(base, username, password) {
  const result = await req(base, 'POST', '/auth/login', { username, password }, { skipAuth: true });
  if (result.status === 200) tokens.set(base, result.body.token);
  return result;
}

/**
 * req(base, method, path, body, options?)
 * options.token   -> ใช้ token นี้แทนที่ token ที่จำไว้จาก login() (ทดสอบ RBAC ข้าม Role)
 * options.skipAuth -> ไม่แนบ Authorization header เลย (ทดสอบ endpoint สาธารณะ หรือกรณีไม่ได้ Login)
 */
async function req(base, method, path, body, options = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = options.skipAuth ? null : options.token || tokens.get(base);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

test('API: Forecast -> MRP end to end (P001 1000 + P002 500)', async () => {
  await withServer(async (base) => {
    await login(base, 'buyer1', 'buyer123');
    const f1 = await req(base, 'POST', '/forecast', { year: 2026, month: 8, productId: 'P001', quantity: 1000, enteredBy: 'buyer1' });
    assert.equal(f1.status, 201);

    const f2 = await req(base, 'POST', '/forecast', { year: 2026, month: 8, productId: 'P002', quantity: 500, enteredBy: 'buyer1' });
    assert.equal(f2.status, 201);

    const mrp = await req(base, 'GET', '/mrp?year=2026&month=8&asOfDate=2026-08-15');
    assert.equal(mrp.status, 200);

    const flour = mrp.body.base.find((r) => r.id === 'M001');
    assert.equal(flour.grossRequirement, 37.5, 'แป้งต้องการ 37.5 kg ตามที่ Explosion ควรได้');

    const breadBaseSources = mrp.body.base
      .flatMap((r) => (r.id === 'M001' ? r.breakdown : []))
      .map((b) => b.source.path[0]);
    assert.ok(breadBaseSources.includes('P001') && breadBaseSources.includes('P002'));
  });
});

test('API: Forecast Revision - เก็บ Version ไม่ทับของเดิม', async () => {
  await withServer(async (base) => {
    await login(base, 'buyer1', 'buyer123');
    await req(base, 'POST', '/forecast', { year: 2026, month: 9, productId: 'P001', quantity: 10000 });
    const revised = await req(base, 'POST', '/forecast', { year: 2026, month: 9, productId: 'P001', quantity: 12000, note: 'ลูกค้าสั่งเพิ่ม' });
    assert.equal(revised.body.revisions.length, 2);
    assert.equal(revised.body.revisions[0].quantity, 10000);
    assert.equal(revised.body.revisions[1].quantity, 12000);
    assert.equal(revised.body.quantity, 12000);
  });
});

test('API: Forecast Adjustment - MRP แยก base vs incremental ไม่ซ้ำซ้อน', async () => {
  await withServer(async (base) => {
    await login(base, 'buyer1', 'buyer123');
    await req(base, 'POST', '/forecast', { year: 2026, month: 10, productId: 'P001', quantity: 10000 });
    await req(base, 'POST', '/forecast/adjustment', { year: 2026, month: 10, productId: 'P001', additionalQty: 2000, customerChannel: 'Modern Trade' });

    const mrp = await req(base, 'GET', '/mrp?year=2026&month=10&asOfDate=2026-10-15');
    const baseFlour = mrp.body.base.find((r) => r.id === 'M001');
    const incFlour = mrp.body.incremental.find((r) => r.id === 'M001');

    assert.equal(baseFlour.grossRequirement, 250); // 10000*0.025
    assert.equal(incFlour.grossRequirement, 50); // 2000*0.025 (เฉพาะส่วนเพิ่ม)
  });
});

test('API: BOM Tree + Where Used', async () => {
  await withServer(async (base) => {
    await login(base, 'buyer1', 'buyer123');
    const tree = await req(base, 'GET', '/bom/P001?asOfDate=2026-08-15');
    assert.equal(tree.status, 200);
    const breadBaseNode = tree.body.components.find((c) => c.componentId === 'P003');
    assert.ok(breadBaseNode.children, 'ต้อง Explode ลูกของ Bread Base ต่อ (Multi-level)');
    assert.ok(breadBaseNode.children.components.some((c) => c.componentId === 'M001'));

    const whereUsed = await req(base, 'GET', '/bom/where-used/SEMI_FINISHED/P003');
    const productIds = whereUsed.body.map((w) => w.productId);
    assert.ok(productIds.includes('P001') && productIds.includes('P002'));
  });
});

test('API: BOM circular reference ถูก Block', async () => {
  await withServer(async (base) => {
    await login(base, 'buyer1', 'buyer123');
    // พยายามให้ P003 (Bread Base) ใช้ P001 เป็น component -> ต้องเกิด cycle เพราะ P001 ใช้ P003 อยู่แล้ว
    const result = await req(base, 'POST', '/bom/P003/detail?asOfDate=2026-08-15', {
      componentType: 'SEMI_FINISHED',
      componentId: 'P001',
      quantity: 1,
    });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /Circular Reference/);
  });
});

test('API: BOM add -> delete component ทำงานถูกต้อง (idempotent, 404 เมื่อไม่พบ)', async () => {
  await withServer(async (base) => {
    await login(base, 'buyer1', 'buyer123');
    const before = await req(base, 'GET', '/bom/P001?asOfDate=2026-08-15');
    const countBefore = before.body.components.length;

    const added = await req(base, 'POST', '/bom/P001/detail?asOfDate=2026-08-15', {
      componentType: 'RAW_MATERIAL',
      componentId: 'M002',
      quantity: 0.005,
      unit: 'kg',
      lossPct: 0,
      yieldPct: 100,
    });
    assert.equal(added.status, 201);

    const afterAdd = await req(base, 'GET', '/bom/P001?asOfDate=2026-08-15');
    assert.equal(afterAdd.body.components.length, countBefore + 1);
    const newDetail = afterAdd.body.components.find((c) => c.componentId === 'M002' && c.quantity === 0.005);
    assert.ok(newDetail, 'ต้องเจอ component ที่เพิ่งเพิ่ม');
    assert.ok(newDetail.bomDetailId, 'ต้องมี bomDetailId ให้ frontend อ้างอิงเพื่อลบ');

    const deleted = await req(base, 'DELETE', `/bom/P001/detail/${newDetail.bomDetailId}`);
    assert.equal(deleted.status, 200);

    const afterDelete = await req(base, 'GET', '/bom/P001?asOfDate=2026-08-15');
    assert.equal(afterDelete.body.components.length, countBefore);

    const deleteAgain = await req(base, 'DELETE', `/bom/P001/detail/${newDetail.bomDetailId}`);
    assert.equal(deleteAgain.status, 404);
  });
});

test('API: PO create -> Partial Receive -> Overdue tracking', async () => {
  await withServer(async (base) => {
    await login(base, 'buyer1', 'buyer123');
    const po = await req(base, 'POST', '/po', {
      supplierId: 'SUP-A',
      expectedDeliveryDate: '2020-01-01', // วันที่ในอดีตมาก ๆ เพื่อให้ทดสอบ Overdue ได้แน่นอน
      lines: [{ materialId: 'M001', orderedQty: 1000, unitPrice: 27 }],
    });
    assert.equal(po.status, 201);
    const poId = po.body.poId;

    await login(base, 'wh1', 'wh123'); // รับสินค้าเป็นหน้าที่ Warehouse เท่านั้น
    const receive1 = await req(base, 'POST', `/po/${poId}/receive`, { lines: [{ materialId: 'M001', receivedQty: 600 }] });
    assert.equal(receive1.body.status, 'PARTIALLY_RECEIVED');

    const tracking = await req(base, 'GET', '/po');
    const line = tracking.body.find((p) => p.poId === poId);
    assert.equal(line.lines[0].outstanding, 400);
    assert.equal(line.isOverdue, true);
    assert.ok(line.delayDays > 0);

    const receive2 = await req(base, 'POST', `/po/${poId}/receive`, { lines: [{ materialId: 'M001', receivedQty: 400 }] });
    assert.equal(receive2.body.status, 'RECEIVED');
  });
});

test('API: Open PO ลดยอด Net Requirement ของ MRP รอบถัดไป', async () => {
  await withServer(async (base) => {
    await login(base, 'buyer1', 'buyer123');
    await req(base, 'POST', '/forecast', { year: 2027, month: 1, productId: 'P001', quantity: 100000 });
    const before = await req(base, 'GET', '/mrp?year=2027&month=1&asOfDate=2027-01-15');
    const flourBefore = before.body.base.find((r) => r.id === 'M001');

    await req(base, 'POST', '/po', {
      supplierId: 'SUP-A',
      expectedDeliveryDate: '2027-02-01',
      lines: [{ materialId: 'M001', orderedQty: 500, unitPrice: 27 }],
    });

    const after = await req(base, 'GET', '/mrp?year=2027&month=1&asOfDate=2027-01-15');
    const flourAfter = after.body.base.find((r) => r.id === 'M001');

    assert.equal(flourAfter.openQty, 500);
    assert.equal(flourAfter.netRequirement, flourBefore.netRequirement - 500);
  });
});

test('API: 404 / 400 handling', async () => {
  await withServer(async (base) => {
    await login(base, 'buyer1', 'buyer123');
    const notFound = await req(base, 'GET', '/mrp?year=1999&month=1');
    assert.equal(notFound.status, 404);

    const badReq = await req(base, 'POST', '/forecast', { year: 2026 }); // ขาด field
    assert.equal(badReq.status, 400);
  });
});

test('API: Dashboard Purchasing/Executive aggregation คำนวณจากข้อมูลจริง', async () => {
  await withServer(async (base) => {
    await login(base, 'buyer1', 'buyer123');
    // ไม่มี Forecast/PO เลย -> ต้องไม่ error, คืนค่า 0/[] แทนการ throw 404
    const empty = await req(base, 'GET', '/dashboard/purchasing?year=2028&month=3&asOfDate=2028-03-15');
    assert.equal(empty.status, 200);
    assert.equal(empty.body.kpis.itemsToOrder, 0);

    const emptyExec = await req(base, 'GET', '/dashboard/executive?year=2028&month=3&asOfDate=2028-03-15');
    assert.equal(emptyExec.status, 200);
    assert.equal(emptyExec.body.kpis.forecastValue, 0);

    // Forecast 100,000 ขนมปังไส้หมูหยอง (ตัวเลขใหญ่พอให้เกิด Net Requirement ต้องสั่งจริง)
    // -> BOM Cost roll-up ต้องตรงกับที่คำนวณด้วยมือ
    await req(base, 'POST', '/forecast', { year: 2028, month: 3, productId: 'P001', quantity: 100000 });

    const exec1 = await req(base, 'GET', '/dashboard/executive?year=2028&month=3&asOfDate=2028-03-15');
    assert.equal(exec1.body.kpis.forecastValue, 827000); // BOM cost 8.27/pcs x 100,000
    assert.equal(exec1.body.kpis.requirementValue, 827000); // เท่ากันโดยไม่มี loss/yield

    const purchasing1 = await req(base, 'GET', '/dashboard/purchasing?year=2028&month=3&asOfDate=2028-03-15');
    assert.ok(purchasing1.body.kpis.itemsToOrder > 0);
    assert.ok(purchasing1.body.kpis.valueToOrder > 0);

    // สร้าง PO 2 ใบ คนละ Supplier, ใบหนึ่งราคาสูงขึ้นจากราคาปัจจุบันของ Material (เพื่อทดสอบ Price Increase tracking)
    await req(base, 'POST', '/po', {
      supplierId: 'SUP-A', expectedDeliveryDate: '2028-04-01',
      lines: [{ materialId: 'M001', orderedQty: 200, unitPrice: 27 }], // ราคาเท่าเดิม ไม่ควรขึ้น Price Increase
    });
    await req(base, 'POST', '/po', {
      supplierId: 'SUP-B', expectedDeliveryDate: '2028-04-01',
      lines: [{ materialId: 'M004', orderedQty: 50, unitPrice: 140 }], // เดิม 130 -> ขึ้นราคา
    });

    const purchasing2 = await req(base, 'GET', '/dashboard/purchasing?year=2028&month=3&asOfDate=2028-03-15');
    assert.equal(purchasing2.body.kpis.openPoValue, 5400 + 7000);
    assert.equal(purchasing2.body.kpis.outstandingValue, 5400 + 7000); // ยังไม่รับเลย
    assert.equal(purchasing2.body.kpis.receivedValue, 0);

    const exec2 = await req(base, 'GET', '/dashboard/executive?year=2028&month=3&asOfDate=2028-03-15');
    const supplierValues = Object.fromEntries(exec2.body.charts.openPoBySupplier.map((s) => [s.supplierId, s.value]));
    assert.equal(supplierValues['SUP-A'], 5400);
    assert.equal(supplierValues['SUP-B'], 7000);

    const topMaterialIds = exec2.body.charts.topMaterials.map((m) => m.materialId);
    assert.ok(topMaterialIds.includes('M001') && topMaterialIds.includes('M004'));

    const priceIncrease = exec2.body.priceIncreases.find((p) => p.materialId === 'M004');
    assert.ok(priceIncrease, 'ต้องบันทึก Price Increase ของ M004');
    assert.equal(priceIncrease.from, 130);
    assert.equal(priceIncrease.to, 140);

    const noIncreaseForM001 = exec2.body.priceIncreases.find((p) => p.materialId === 'M001');
    assert.equal(noIncreaseForM001, undefined, 'M001 ราคาไม่เปลี่ยน ไม่ควรถูกบันทึกเป็น Price Increase');

    // รับสินค้าบางส่วน -> Outstanding ต้องลดลง, Received ต้องเพิ่มขึ้น
    const poList = await req(base, 'GET', '/po');
    const poA = poList.body.find((p) => p.supplierId === 'SUP-A');
    await login(base, 'wh1', 'wh123'); // รับสินค้าเป็นหน้าที่ Warehouse เท่านั้น
    await req(base, 'POST', `/po/${poA.poId}/receive`, { lines: [{ materialId: 'M001', receivedQty: 200 }] });

    await login(base, 'buyer1', 'buyer123'); // สลับกลับมาดู Dashboard ต่อ (Warehouse ไม่มีสิทธิ์ดู Dashboard)
    const purchasing3 = await req(base, 'GET', '/dashboard/purchasing?year=2028&month=3&asOfDate=2028-03-15');
    assert.equal(purchasing3.body.kpis.receivedValue, 5400);
    assert.equal(purchasing3.body.kpis.outstandingValue, 7000); // เหลือแค่ PO ของ SUP-B
  });
});

test('API: Auth - login สำเร็จ/ล้มเหลว, /auth/me, ไม่มี Token ต้อง 401', async () => {
  await withServer(async (base) => {
    const badLogin = await req(base, 'POST', '/auth/login', { username: 'buyer1', password: 'wrong-password' });
    assert.equal(badLogin.status, 401);

    const goodLogin = await login(base, 'buyer1', 'buyer123');
    assert.equal(goodLogin.status, 200);
    assert.equal(goodLogin.body.user.role, 'PURCHASING');
    assert.ok(goodLogin.body.token);

    const me = await req(base, 'GET', '/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.username, 'buyer1');

    // ไม่มี Token เลย -> 401
    const noAuth = await req(base, 'GET', '/forecast?year=2026&month=8', undefined, { skipAuth: true });
    assert.equal(noAuth.status, 401);

    // Token ปลอม -> 401
    const fakeToken = await req(base, 'GET', '/forecast?year=2026&month=8', undefined, { token: 'not-a-real-token' });
    assert.equal(fakeToken.status, 401);
  });
});

test('API: RBAC - แต่ละ Role เข้าถึงได้เฉพาะส่วนที่กำหนดไว้ (STEP 38)', async () => {
  await withServer(async (base) => {
    const buyer = (await login(base, 'buyer1', 'buyer123')).body.token;
    const warehouse = (await login(base, 'wh1', 'wh123')).body.token;
    const manager = (await login(base, 'mgr1', 'mgr123')).body.token;
    const admin = (await login(base, 'admin', 'admin123')).body.token;

    // Warehouse ห้ามสร้าง Forecast
    const whForecast = await req(base, 'POST', '/forecast', { year: 2029, month: 1, productId: 'P001', quantity: 100 }, { token: warehouse });
    assert.equal(whForecast.status, 403);

    // Management อ่าน Forecast ได้ แต่สร้างไม่ได้ (ห้ามแก้ Master Data)
    const mgrForecastWrite = await req(base, 'POST', '/forecast', { year: 2029, month: 1, productId: 'P001', quantity: 100 }, { token: manager });
    assert.equal(mgrForecastWrite.status, 403);

    const purchasingCreate = await req(base, 'POST', '/forecast', { year: 2029, month: 1, productId: 'P001', quantity: 100 }, { token: buyer });
    assert.equal(purchasingCreate.status, 201);

    const mgrForecastRead = await req(base, 'GET', '/forecast?year=2029&month=1', undefined, { token: manager });
    assert.equal(mgrForecastRead.status, 200);

    // Warehouse อ่าน Forecast ไม่ได้เลย (ไม่อยู่ในขอบเขตงาน)
    const whForecastRead = await req(base, 'GET', '/forecast?year=2029&month=1', undefined, { token: warehouse });
    assert.equal(whForecastRead.status, 403);

    // สร้าง PO เพื่อทดสอบ Receiving RBAC
    const po = await req(base, 'POST', '/po', {
      supplierId: 'SUP-A', expectedDeliveryDate: '2029-02-01',
      lines: [{ materialId: 'M001', orderedQty: 100, unitPrice: 27 }],
    }, { token: buyer });
    assert.equal(po.status, 201);

    // Purchasing สร้าง PO ได้ แต่รับสินค้าไม่ได้ (ต้องเป็น Warehouse)
    const buyerReceive = await req(base, 'POST', `/po/${po.body.poId}/receive`, { lines: [{ materialId: 'M001', receivedQty: 50 }] }, { token: buyer });
    assert.equal(buyerReceive.status, 403);

    // Warehouse รับสินค้าได้
    const whReceive = await req(base, 'POST', `/po/${po.body.poId}/receive`, { lines: [{ materialId: 'M001', receivedQty: 50 }] }, { token: warehouse });
    assert.equal(whReceive.status, 200);

    // Warehouse ดู PO Tracking ได้ (อยู่ในขอบเขตงาน)
    const whViewPo = await req(base, 'GET', '/po', undefined, { token: warehouse });
    assert.equal(whViewPo.status, 200);

    // Management แก้ BOM ไม่ได้
    const mgrBomWrite = await req(base, 'POST', '/bom/P001/detail?asOfDate=2029-01-01',
      { componentType: 'PACKAGING', componentId: 'M006', quantity: 1 }, { token: manager });
    assert.equal(mgrBomWrite.status, 403);

    // ADMIN ผ่านได้ทุก Role-restricted endpoint โดยไม่ต้องอยู่ในลิสต์
    const adminReceive = await req(base, 'POST', `/po/${po.body.poId}/receive`, { lines: [{ materialId: 'M001', receivedQty: 10 }] }, { token: admin });
    assert.equal(adminReceive.status, 200);
  });
});
