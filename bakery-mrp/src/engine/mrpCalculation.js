'use strict';

const { explodeAndAggregate } = require('./bomExplosion');

/**
 * คำนวณ MRP เต็มรูปแบบ ตาม Phase 1 STEP 14 / STEP 15:
 * Net Requirement = Gross Requirement + Safety Stock
 *                    - Current Stock - Open PO/Production - Scheduled Receipt
 * ถ้าติดลบ -> floor ที่ 0 พร้อม status "เพียงพอ"
 *
 * @param {Array<{productId:any, quantity:number}>} forecastLines
 * @param {string|Date} asOfDate  ใช้เลือก BOM Version ที่ Effective ตรงกับช่วงเวลา
 * @param {object} repo ดู interface ด้านล่าง
 * repo ต้องมี:
 *   getActiveBom(productId, asOfDate)
 *   getStock(type, id) -> number
 *   getSafetyStock(id) -> number
 *   getOpenPoQty(materialId) -> number            (สำหรับ RAW_MATERIAL/PACKAGING)
 *   getOpenProductionQty(semiFinishedId) -> number (สำหรับ SEMI_FINISHED)
 *   getScheduledReceipt(id) -> number
 *   getConversionRate(id) -> number (base unit ต่อ 1 purchase unit, default 1)
 *   getMaterialPrice(id) -> number
 */
function calculateMRP(forecastLines, asOfDate, repo) {
  const aggregated = explodeAndAggregate(forecastLines, asOfDate, repo);
  const results = [];

  for (const item of aggregated) {
    const stock = repo.getStock(item.type, item.id) || 0;
    const safetyStock = (repo.getSafetyStock && repo.getSafetyStock(item.id)) || 0;
    const scheduledReceipt = (repo.getScheduledReceipt && repo.getScheduledReceipt(item.id)) || 0;

    const openQty =
      item.type === 'SEMI_FINISHED'
        ? (repo.getOpenProductionQty && repo.getOpenProductionQty(item.id)) || 0
        : (repo.getOpenPoQty && repo.getOpenPoQty(item.id)) || 0;

    const grossRequirement = item.totalQty;
    let netRequirement = grossRequirement + safetyStock - stock - openQty - scheduledReceipt;

    let status;
    if (netRequirement < 0) {
      netRequirement = 0;
      status = item.type === 'SEMI_FINISHED' ? 'Stock + Open Production เพียงพอ' : 'Stock + Open PO เพียงพอ';
    } else {
      status = item.type === 'SEMI_FINISHED' ? 'ต้องผลิตเพิ่ม' : 'ต้องสั่งเพิ่ม';
    }

    const conversionRate = (repo.getConversionRate && repo.getConversionRate(item.id)) || 1;
    const purchaseQtyNeeded = conversionRate > 0 ? Math.ceil(netRequirement / conversionRate) : null;

    const price = (repo.getMaterialPrice && repo.getMaterialPrice(item.id)) || 0;
    const requirementValue = round2(netRequirement * price);

    results.push({
      type: item.type,
      id: item.id,
      unit: item.unit,
      grossRequirement: round3(grossRequirement),
      safetyStock,
      currentStock: stock,
      openQty,
      scheduledReceipt,
      netRequirement: round3(netRequirement),
      purchaseQtyNeeded,
      requirementValue,
      status,
      breakdown: item.breakdown, // สำหรับ Drill Down กลับไปยัง Product ต้นทาง
    });
  }

  return results;
}

/**
 * Production Requirement สำหรับ Semi-Finished โดยเฉพาะ (STEP 32)
 * เป็น subset ของผลลัพธ์ calculateMRP ที่ type === 'SEMI_FINISHED'
 */
function calculateProductionRequirement(mrpResults) {
  return mrpResults
    .filter((r) => r.type === 'SEMI_FINISHED')
    .map((r) => ({
      semiFinishedProductId: r.id,
      grossRequirement: r.grossRequirement,
      currentStock: r.currentStock,
      openProductionQty: r.openQty,
      netProductionRequirement: r.netRequirement,
    }));
}

/**
 * Forecast Adjustment (STEP 11 / Edge Case 2): คำนวณเฉพาะส่วนที่เพิ่มขึ้นระหว่างเดือน
 * แยก MRP record ต่างหาก ไม่ปนกับ Requirement ของ Forecast หลักที่คำนวณไปแล้ว
 */
function calculateIncrementalMRP(adjustmentLines, asOfDate, repo) {
  return calculateMRP(adjustmentLines, asOfDate, repo);
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { calculateMRP, calculateProductionRequirement, calculateIncrementalMRP };
