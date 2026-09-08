'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadCalculationContext, checkNewBomEdgeForCycle } = require('../src/db/repository');
const { calculateMRP } = require('../src/engine/mrpCalculation');
const { explodeAndAggregate } = require('../src/engine/bomExplosion');
const { createMockPool } = require('./mockPool');

test('repository: loadCalculationContext ประกอบ repo จาก SQL rows แล้ว Engine คำนวณได้ถูกต้อง', async () => {
  const pool = createMockPool();
  const repo = await loadCalculationContext(pool, [1, 2], '2026-08-15'); // P001, P002

  // ตรวจว่า getActiveBom คืนโครงสร้างถูกต้องสำหรับทั้ง root และ semi-finished descendant
  const bomP001 = repo.getActiveBom(1);
  assert.ok(bomP001, 'ต้องพบ BOM ของ P001');
  assert.equal(bomP001.details.length, 3);

  const bomP003 = repo.getActiveBom(3); // ควรถูกดึงมาด้วยแม้ไม่ใช่ root เพราะเป็น descendant
  assert.ok(bomP003, 'ต้องพบ BOM ของ P003 (Bread Base) แม้ไม่ใช่ root product');

  // Explode + Aggregate เหมือนทดสอบใน engine.test.js STEP11 แต่คราวนี้ผ่าน repo ที่มาจาก "SQL" จริง
  const exploded = explodeAndAggregate(
    [
      { productId: 1, quantity: 1000 },
      { productId: 2, quantity: 500 },
    ],
    '2026-08-15',
    repo
  );
  const breadBase = exploded.find((x) => x.type === 'SEMI_FINISHED' && x.id === 3);
  assert.equal(breadBase.totalQty, 1500, 'Bread Base ต้องรวมเป็น 1,500 ชิ้น');

  const flour = exploded.find((x) => x.type === 'RAW_MATERIAL' && x.id === 1);
  assert.equal(flour.totalQty, 37.5, 'แป้งต้องการ 37.5 kg');

  // ตรวจ MRP เต็ม pipeline: Net Requirement ของแป้ง = Gross+SS-Stock-OpenPO
  const mrp = calculateMRP(
    [
      { productId: 1, quantity: 1000 },
      { productId: 2, quantity: 500 },
    ],
    '2026-08-15',
    repo
  );
  const flourMrp = mrp.find((r) => r.id === 1);
  // Gross 37.5 + SS 30 - Stock 100 - OpenPO 50 = -82.5 -> floor 0
  assert.equal(flourMrp.netRequirement, 0);
  assert.equal(flourMrp.status, 'Stock + Open PO เพียงพอ');

  const boxMrp = mrp.find((r) => r.id === 6);
  // Packaging: gross = 1000+500 = 1500 pcs, +SS500 -stock2000 -openPO5000 -> ติดลบมาก -> 0
  assert.equal(boxMrp.netRequirement, 0);
});

test('repository: checkNewBomEdgeForCycle ตรวจจับ Circular ผ่าน mock graph query', async () => {
  const pool = createMockPool();
  // เสริม query สำหรับ semi-finished graph (bom join ไม่ใช่ reachable/materials/stock/po)
  pool.query = wrapWithGraphQuery(pool.query);

  const willCycle = await checkNewBomEdgeForCycle(pool, 3, 1, '2026-08-15'); // P003 พยายามใช้ P001 (ซึ่ง P001 ใช้ P003 อยู่แล้ว)
  assert.equal(willCycle, true);

  const noCycle = await checkNewBomEdgeForCycle(pool, 99, 3, '2026-08-15');
  assert.equal(noCycle, false);
});

function wrapWithGraphQuery(originalQuery) {
  // graph: P001(1)->P003(3), P002(2)->P003(3)
  const graphRows = [
    { parent_id: 1, child_id: 3 },
    { parent_id: 2, child_id: 3 },
  ];
  return async function (text, params) {
    if (text.includes('bd.component_product_id AS child_id')) {
      return { rows: graphRows };
    }
    return originalQuery.call(this, text, params);
  };
}
