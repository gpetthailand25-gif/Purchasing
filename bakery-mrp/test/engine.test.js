'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { explodeBOM, aggregateRequirement, explodeAndAggregate } = require('../src/engine/bomExplosion');
const { calculateMRP } = require('../src/engine/mrpCalculation');
const { wouldCreateCycle, CircularBomError } = require('../src/engine/circularCheck');
const { calculateReceivingStatus, calculateOverdue } = require('../src/engine/poTracking');
const { buildBakeryRepo, buildSimpleRepo } = require('./testData');

// ---------------------------------------------------------------------------
// STEP 11: ทดสอบ Calculation (Trace ตาม Phase 2 ตัวอย่าง)
// ---------------------------------------------------------------------------

test('STEP11: BOM Explosion - shared Bread Base รวมยอดถูกต้อง (1000+500 -> 1500 -> 37.5kg flour)', () => {
  const repo = buildBakeryRepo();
  const asOfDate = '2026-08-15';

  const exploded = explodeAndAggregate(
    [
      { productId: 'P001', quantity: 1000 },
      { productId: 'P002', quantity: 500 },
    ],
    asOfDate,
    repo
  );

  const breadBase = exploded.find((x) => x.type === 'SEMI_FINISHED' && x.id === 'P003');
  assert.equal(breadBase.totalQty, 1500, 'Bread Base ต้องรวมเป็น 1,500 ชิ้น');
  assert.equal(breadBase.breakdown.length, 2, 'ต้องมี breakdown 2 แหล่งที่มา (P001, P002)');

  const flour = exploded.find((x) => x.type === 'RAW_MATERIAL' && x.id === 'M001');
  assert.equal(flour.totalQty, 37.5, 'แป้งต้องการ 37.5 kg ตรงกับตัวอย่างในโจทย์');
});

test('STEP11: MRP formula ตรงกับตัวอย่าง STEP15 (Flour/Butter/Box)', () => {
  const repo = buildSimpleRepo();
  const results = calculateMRP([{ productId: 'ProductA', quantity: 10000 }], '2026-08-15', repo);

  const flour = results.find((r) => r.id === 'Flour');
  const butter = results.find((r) => r.id === 'Butter');
  const box = results.find((r) => r.id === 'Box');

  assert.equal(flour.grossRequirement, 250);
  assert.equal(flour.netRequirement, 130, 'Flour: 250+30-100-50 = 130 kg');

  assert.equal(butter.grossRequirement, 100);
  assert.equal(butter.netRequirement, 70, 'Butter: 100+20-30-20 = 70 kg');

  assert.equal(box.grossRequirement, 10000);
  assert.equal(box.netRequirement, 3500, 'Box: 10000+500-2000-5000 = 3500 pcs');
});

// ---------------------------------------------------------------------------
// STEP 12: Edge Cases (1-10)
// ---------------------------------------------------------------------------

test('Case 1: Shared Semi-Finished - รวม Requirement จากหลาย Finished Product ถูกต้อง', () => {
  const repo = buildBakeryRepo();
  const exploded = explodeAndAggregate(
    [
      { productId: 'P001', quantity: 1000 },
      { productId: 'P002', quantity: 500 },
    ],
    '2026-08-15',
    repo
  );
  const breadBase = exploded.find((x) => x.id === 'P003');
  assert.equal(breadBase.totalQty, 1500);
  const fromP001 = breadBase.breakdown.find((b) => b.source.product === 'P001');
  const fromP002 = breadBase.breakdown.find((b) => b.source.product === 'P002');
  assert.equal(fromP001.qty, 1000);
  assert.equal(fromP002.qty, 500);
});

test('Case 2: Forecast เพิ่มกลางเดือน - คำนวณเฉพาะส่วนเพิ่ม ไม่สร้าง Requirement ซ้ำ', () => {
  const repo = buildBakeryRepo();
  const asOfDate = '2026-08-15';

  // Forecast หลักคำนวณไปแล้วรอบหนึ่ง (10,000)
  const mainResults = calculateMRP([{ productId: 'P001', quantity: 10000 }], asOfDate, repo);
  const mainFlour = mainResults.find((r) => r.id === 'M001');

  // Adjustment ระหว่างเดือน +2,000 คำนวณแยกเป็นอีก MRP run (incremental only)
  const incrementalResults = calculateMRP([{ productId: 'P001', quantity: 2000 }], asOfDate, repo);
  const incFlour = incrementalResults.find((r) => r.id === 'M001');

  // ยืนยันว่า incremental gross ไม่ใช่ผลรวมของ 12,000 (ไม่ได้ re-explode ยอดเดิมซ้ำ)
  const expectedIncrementalGross = 2000 * 0.025; // เฉพาะส่วนเพิ่ม
  assert.equal(incFlour.grossRequirement, expectedIncrementalGross);
  assert.notEqual(incFlour.grossRequirement, mainFlour.grossRequirement + expectedIncrementalGross);
});

test('Case 3: Stock เพียงพอ - Net Requirement floor ที่ 0 พร้อม status ถูกต้อง', () => {
  const repo = buildBakeryRepo();
  // Forecast น้อยมากจน Stock+OpenPO ที่มีอยู่ (150kg) เพียงพอ
  const results = calculateMRP([{ productId: 'P001', quantity: 10 }], '2026-08-15', repo);
  const flour = results.find((r) => r.id === 'M001');
  assert.equal(flour.netRequirement, 0);
  assert.equal(flour.status, 'Stock + Open PO เพียงพอ');
});

test('Case 4: มี Open PO - ต้องถูกหักออกจาก Requirement', () => {
  const repo = buildBakeryRepo();
  const results = calculateMRP([{ productId: 'P001', quantity: 1000 }], '2026-08-15', repo);
  const flour = results.find((r) => r.id === 'M001');
  // Gross = 1000*0.025=25kg (+ safety 30 - stock100 - openPO50) -> ติดลบ -> 0, ยืนยันว่า openQty ถูกดึงมาใช้จริง
  assert.equal(flour.openQty, 50);
});

test('Case 5: PO รับสินค้าบางส่วน - Outstanding คำนวณถูกต้อง', () => {
  const r1 = calculateReceivingStatus(1000, 600);
  assert.equal(r1.outstanding, 400);
  assert.equal(r1.status, 'Partially Received');

  const r2 = calculateReceivingStatus(1000, 900); // รับเพิ่มอีก 300 รวม 900
  assert.equal(r2.outstanding, 100);
  assert.equal(r2.status, 'Partially Received');

  const r3 = calculateReceivingStatus(1000, 1000);
  assert.equal(r3.outstanding, 0);
  assert.equal(r3.status, 'Received');
});

test('Case 6: PO เกินกำหนด - แสดง Overdue และจำนวนวันล่าช้าถูกต้อง', () => {
  const expected = new Date('2026-08-20');
  const today = new Date('2026-08-27');
  const result = calculateOverdue(expected, today, false);
  assert.equal(result.isOverdue, true);
  assert.equal(result.delayDays, 7);

  const notOverdue = calculateOverdue(expected, today, true); // รับครบแล้ว
  assert.equal(notOverdue.isOverdue, false);
});

test('Case 7: เปลี่ยน BOM Version - Forecast เดือนเก่าต้องใช้ Version เดิม ไม่เปลี่ยน', () => {
  const repo = buildBakeryRepo();

  const augResult = calculateMRP([{ productId: 'P001', quantity: 1000 }], '2026-08-15', repo);
  const augFlour = augResult.find((r) => r.id === 'M001');
  assert.equal(augFlour.grossRequirement, 25, 'Aug ต้องใช้ BOM v1.0 (25g/pcs) -> 1000*0.025=25kg');

  const sepResult = calculateMRP([{ productId: 'P001', quantity: 1000 }], '2026-09-15', repo);
  const sepFlour = sepResult.find((r) => r.id === 'M001');
  assert.equal(sepFlour.grossRequirement, 28, 'Sep ต้องใช้ BOM v2.0 (28g/pcs) -> 1000*0.028=28kg');
});

test('Case 8: Material ใช้ในหลาย Product - MRP รวมถูกต้องและ Drill Down กลับไปยัง Product ต้นทางได้', () => {
  const repo = buildBakeryRepo();
  const exploded = explodeAndAggregate(
    [
      { productId: 'P001', quantity: 1000 },
      { productId: 'P002', quantity: 500 },
    ],
    '2026-08-15',
    repo
  );
  const flour = exploded.find((x) => x.id === 'M001');
  assert.equal(flour.totalQty, 37.5);
  // breakdown ต้อง trace กลับไปถึง P001/P002 ผ่าน path (ผ่าน Bread Base)
  const paths = flour.breakdown.map((b) => b.source.path[0]);
  assert.ok(paths.includes('P001') && paths.includes('P002'));
});

test('Case 9: Circular BOM ต้องถูก Block ตอนพยายามสร้าง', () => {
  const repo = buildBakeryRepo();
  // สมมติพยายามตั้งให้ P003 (Bread Base) ใช้ P001 เป็น Component (แต่ P001 ใช้ P003 อยู่แล้ว)
  const willCycle = wouldCreateCycle('P003', 'P001', (pid) => {
    if (pid === 'P001') return ['P003'];
    return repo.getSemiFinishedChildren(pid);
  });
  assert.equal(willCycle, true);

  // กรณีปกติ ไม่เกิด cycle
  const noCycle = wouldCreateCycle('P009', 'P003', (pid) => repo.getSemiFinishedChildren(pid));
  assert.equal(noCycle, false);

  // explodeBOM เองก็ต้อง throw ถ้า path ระหว่าง explosion วนซ้ำ
  const cyclicRepo = {
    getActiveBom(pid) {
      if (pid === 'X') return { details: [{ bomDetailId: 'x1', componentType: 'SEMI_FINISHED', componentId: 'Y', quantity: 1, yieldPct: 100 }] };
      if (pid === 'Y') return { details: [{ bomDetailId: 'y1', componentType: 'SEMI_FINISHED', componentId: 'X', quantity: 1, yieldPct: 100 }] };
      return null;
    },
  };
  assert.throws(() => explodeBOM('X', 10, '2026-01-01', cyclicRepo), CircularBomError);
});

test('Case 10: Unit Conversion - คำนวณจำนวนสั่งซื้อเป็น Purchase Unit ถูกต้อง (round up)', () => {
  const repo = buildBakeryRepo();
  const results = calculateMRP([{ productId: 'P001', quantity: 1000 }], '2026-08-15', repo);
  const flour = results.find((r) => r.id === 'M001');
  // netRequirement ของ M001 ในเคสนี้ = 0 (เพราะ stock/openPO เพียงพอ) ทดสอบซ้ำด้วย forecast ใหญ่ขึ้น
  const bigResults = calculateMRP([{ productId: 'P001', quantity: 100000 }], '2026-08-15', repo);
  const bigFlour = bigResults.find((r) => r.id === 'M001');
  // gross = 100000*0.025=2500kg, net = 2500+30-100-50=2380kg, conversion 25kg/bag -> ceil(2380/25)=96 bags
  assert.equal(bigFlour.netRequirement, 2380);
  assert.equal(bigFlour.purchaseQtyNeeded, 96);
});
