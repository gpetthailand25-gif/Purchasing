'use strict';

const { CircularBomError } = require('./circularCheck');

/**
 * Repository interface expected (see src/db/repository.example.js สำหรับตัวอย่างจริงที่ต่อ PostgreSQL):
 *   getActiveBom(productId, asOfDate) -> { bomId, version, details: BomDetail[] } | null
 *   BomDetail: { bomDetailId, componentType: 'SEMI_FINISHED'|'RAW_MATERIAL'|'PACKAGING',
 *                componentId, quantity, unit, lossPct, yieldPct }
 */

/**
 * Explode BOM แบบ Recursive ลงไปทุก Level พร้อมป้องกัน Circular Reference (STEP 35)
 * และคำนวณ Loss% / Yield% ตาม STEP 14 ของ Phase 1
 *
 * @returns {Array<{type:string, id:any, qty:number, unit:any, source:object}>} รายการ "ยังไม่ Aggregate"
 */
function explodeBOM(productId, requiredQty, asOfDate, repo, visitedPath = []) {
  if (visitedPath.some((p) => String(p) === String(productId))) {
    throw new CircularBomError([...visitedPath, productId]);
  }
  const newPath = [...visitedPath, productId];

  const bom = repo.getActiveBom(productId, asOfDate);
  if (!bom) return []; // ไม่มี BOM = Leaf (ซื้อขาด/ไม่มีสูตรต่อ)

  const results = [];

  for (const detail of bom.details) {
    const yieldFactor = (detail.yieldPct ?? 100) / 100;
    const lossFactor = 1 + (detail.lossPct ?? 0) / 100;
    if (yieldFactor <= 0) {
      throw new Error(`yield_pct ต้องมากกว่า 0 (bom_detail_id=${detail.bomDetailId})`);
    }
    const neededQty = (requiredQty * detail.quantity / yieldFactor) * lossFactor;

    if (detail.componentType === 'RAW_MATERIAL' || detail.componentType === 'PACKAGING') {
      results.push({
        type: detail.componentType,
        id: detail.componentId,
        qty: neededQty,
        unit: detail.unit,
        source: { product: productId, bomDetailId: detail.bomDetailId, path: newPath },
      });
    } else if (detail.componentType === 'SEMI_FINISHED') {
      results.push({
        type: 'SEMI_FINISHED',
        id: detail.componentId,
        qty: neededQty,
        unit: detail.unit,
        source: { product: productId, bomDetailId: detail.bomDetailId, path: newPath },
      });
      const childResults = explodeBOM(detail.componentId, neededQty, asOfDate, repo, newPath);
      results.push(...childResults);
    } else {
      throw new Error(`Unknown component_type: ${detail.componentType}`);
    }
  }

  return results;
}

/**
 * รวม Requirement ของ component เดียวกัน (type+id) ที่มาจากหลายเส้นทาง (STEP 8)
 * พร้อมเก็บ breakdown ไว้สำหรับ Drill Down กลับไปยัง Product ต้นทาง
 */
function aggregateRequirement(explodedList) {
  const groups = new Map();

  for (const item of explodedList) {
    const key = `${item.type}:${item.id}`;
    if (!groups.has(key)) {
      groups.set(key, { type: item.type, id: item.id, unit: item.unit, totalQty: 0, breakdown: [] });
    }
    const group = groups.get(key);
    group.totalQty += item.qty;
    group.breakdown.push({ qty: item.qty, source: item.source });
  }

  return Array.from(groups.values());
}

/**
 * Helper: Explode + Aggregate หลาย Forecast line พร้อมกัน (ใช้ตรงกับ MRP engine)
 */
function explodeAndAggregate(forecastLines, asOfDate, repo) {
  const all = [];
  for (const line of forecastLines) {
    all.push(...explodeBOM(line.productId, line.quantity, asOfDate, repo));
  }
  return aggregateRequirement(all);
}

/**
 * BOM Cost Roll-up (STEP 33): คำนวณต้นทุนต่อหน่วยของ Product แบบไล่จาก Leaf ขึ้นมา
 */
function calculateBomCost(productId, asOfDate, repo) {
  const bom = repo.getActiveBom(productId, asOfDate);
  if (!bom) {
    return repo.getMaterialPrice ? (repo.getMaterialPrice(productId) || 0) : 0;
  }
  let total = 0;
  for (const detail of bom.details) {
    const yieldFactor = (detail.yieldPct ?? 100) / 100;
    const lossFactor = 1 + (detail.lossPct ?? 0) / 100;
    const unitCost =
      detail.componentType === 'SEMI_FINISHED'
        ? calculateBomCost(detail.componentId, asOfDate, repo)
        : (repo.getMaterialPrice ? (repo.getMaterialPrice(detail.componentId) || 0) : 0);
    total += (unitCost * detail.quantity / yieldFactor) * lossFactor;
  }
  return total;
}

module.exports = { explodeBOM, aggregateRequirement, explodeAndAggregate, calculateBomCost };
