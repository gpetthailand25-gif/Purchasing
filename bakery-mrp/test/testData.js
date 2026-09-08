'use strict';

/**
 * สร้าง In-Memory Repository จาก Test Data ใน Phase 2 (STEP 10)
 * ใช้ interface เดียวกับที่ engine ต้องการ (ดู comment ใน mrpCalculation.js)
 */
function buildBakeryRepo() {
  // BOM v1.0 Effective 2026-01-01
  const boms = {
    P003: {
      // ขนมปังอบสำเร็จรูป (Semi-Finished)
      bomId: 'BOM-P003-v1',
      version: 'v1.0',
      effectiveDate: '2026-01-01',
      details: [
        { bomDetailId: 'd1', componentType: 'RAW_MATERIAL', componentId: 'M001', quantity: 0.025, unit: 'kg', lossPct: 0, yieldPct: 100 }, // แป้ง 25g
        { bomDetailId: 'd2', componentType: 'RAW_MATERIAL', componentId: 'M002', quantity: 0.010, unit: 'kg', lossPct: 0, yieldPct: 100 }, // น้ำตาล 10g
        { bomDetailId: 'd3', componentType: 'RAW_MATERIAL', componentId: 'M003', quantity: 0.002, unit: 'kg', lossPct: 0, yieldPct: 100 }, // ยีสต์ 2g
        { bomDetailId: 'd4', componentType: 'RAW_MATERIAL', componentId: 'M004', quantity: 0.008, unit: 'kg', lossPct: 0, yieldPct: 100 }, // เนย 8g
        { bomDetailId: 'd5', componentType: 'RAW_MATERIAL', componentId: 'M005', quantity: 0.015, unit: 'kg', lossPct: 0, yieldPct: 100 }, // นม 15g
      ],
    },
    P001: {
      // ขนมปังไส้หมูหยอง (Finished)
      bomId: 'BOM-P001-v1',
      version: 'v1.0',
      effectiveDate: '2026-01-01',
      details: [
        { bomDetailId: 'd6', componentType: 'SEMI_FINISHED', componentId: 'P003', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd7', componentType: 'RAW_MATERIAL', componentId: 'M007', quantity: 0.020, unit: 'kg', lossPct: 0, yieldPct: 100 }, // ไส้หมูหยอง
        { bomDetailId: 'd8', componentType: 'PACKAGING', componentId: 'M006', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
      ],
    },
    P002: {
      // ขนมปังไส้แยม (Finished)
      bomId: 'BOM-P002-v1',
      version: 'v1.0',
      effectiveDate: '2026-01-01',
      details: [
        { bomDetailId: 'd9', componentType: 'SEMI_FINISHED', componentId: 'P003', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd10', componentType: 'RAW_MATERIAL', componentId: 'M008', quantity: 0.015, unit: 'kg', lossPct: 0, yieldPct: 100 }, // แยม
        { bomDetailId: 'd11', componentType: 'PACKAGING', componentId: 'M006', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
      ],
    },
  };

  // BOM v2.0 ของ P003 มีผล Effective ตั้งแต่ 2026-09-01 (สำหรับ Edge Case 7)
  const bomsV2 = {
    P003: {
      bomId: 'BOM-P003-v2',
      version: 'v2.0',
      effectiveDate: '2026-09-01',
      details: [
        { bomDetailId: 'd1v2', componentType: 'RAW_MATERIAL', componentId: 'M001', quantity: 0.028, unit: 'kg', lossPct: 0, yieldPct: 100 }, // แป้งปรับสูตรใหม่ 28g
      ],
    },
  };

  const stock = { M001: 100, M002: 999999, M003: 999999, M004: 30, M005: 999999, M006: 2000, M007: 999999, M008: 999999, P003: 0 };
  const openPo = { M001: 50, M004: 20, M006: 5000 };
  const safetyStock = { M001: 30, M004: 20, M006: 500 };
  const conversionRate = { M001: 25, M004: 10, M006: 1 }; // 1 Bag flour = 25kg, 1 Box butter = 10kg
  const price = { M001: 27, M002: 22, M003: 180, M004: 130, M005: 45, M006: 3.5, M007: 90, M008: 60 };
  const openProduction = { P003: 0 };

  return {
    getActiveBom(productId, asOfDate) {
      const versions = [];
      if (boms[productId]) versions.push(boms[productId]);
      if (bomsV2[productId]) versions.push(bomsV2[productId]);
      // เลือก version ที่ effective_date <= asOfDate โดยเอาตัวล่าสุด
      const applicable = versions
        .filter((v) => new Date(v.effectiveDate) <= new Date(asOfDate))
        .sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));
      return applicable[0] || null;
    },
    getStock(type, id) {
      return stock[id] || 0;
    },
    getSafetyStock(id) {
      return safetyStock[id] || 0;
    },
    getOpenPoQty(id) {
      return openPo[id] || 0;
    },
    getOpenProductionQty(id) {
      return openProduction[id] || 0;
    },
    getScheduledReceipt() {
      return 0;
    },
    getConversionRate(id) {
      return conversionRate[id] || 1;
    },
    getMaterialPrice(id) {
      return price[id] || 0;
    },
    // เฉพาะใช้กับ circularCheck: คืน component_product_id (SEMI_FINISHED เท่านั้น) ของ Active BOM
    getSemiFinishedChildren(productId) {
      const bom = boms[productId];
      if (!bom) return [];
      return bom.details.filter((d) => d.componentType === 'SEMI_FINISHED').map((d) => d.componentId);
    },
  };
}

/** Repo แบบง่าย ใช้ทดสอบสูตร MRP ตรงตามตัวอย่าง Phase 1 STEP 15 (single level, ไม่มี Semi-Finished) */
function buildSimpleRepo() {
  const bom = {
    ProductA: {
      bomId: 'BOM-A-v1',
      version: 'v1.0',
      effectiveDate: '2026-01-01',
      details: [
        { bomDetailId: 's1', componentType: 'RAW_MATERIAL', componentId: 'Flour', quantity: 0.025, unit: 'kg', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 's2', componentType: 'RAW_MATERIAL', componentId: 'Butter', quantity: 0.010, unit: 'kg', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 's3', componentType: 'PACKAGING', componentId: 'Box', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
      ],
    },
  };
  const stock = { Flour: 100, Butter: 30, Box: 2000 };
  const openPo = { Flour: 50, Butter: 20, Box: 5000 };
  const safetyStock = { Flour: 30, Butter: 20, Box: 500 };

  return {
    getActiveBom(productId) {
      return bom[productId] || null;
    },
    getStock(type, id) {
      return stock[id] || 0;
    },
    getSafetyStock(id) {
      return safetyStock[id] || 0;
    },
    getOpenPoQty(id) {
      return openPo[id] || 0;
    },
    getOpenProductionQty() {
      return 0;
    },
    getScheduledReceipt() {
      return 0;
    },
    getConversionRate() {
      return 1;
    },
    getMaterialPrice() {
      return 0;
    },
  };
}

module.exports = { buildBakeryRepo, buildSimpleRepo };
