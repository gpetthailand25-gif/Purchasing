'use strict';

/**
 * repository.js
 * ----------------------------------------------------------------------------
 * ต่อ Calculation Engine (src/engine/*.js) เข้ากับ PostgreSQL จริง ตาม schema.sql
 *
 * ต้องติดตั้งก่อนใช้งานจริง:  npm install pg
 * รับ `pool` เป็น instance ของ `pg.Pool` (หรือ object ใด ๆ ที่มี
 * `async query(text, params) -> { rows }` ก็ใช้แทนกันได้ เช่น pg.Client,
 * หรือ mock สำหรับเทส — ดู test/repository.test.js)
 *
 * หลักการสำคัญ: Engine (bomExplosion.js, mrpCalculation.js) เป็น pure/synchronous
 * function ที่ recursive ระหว่างคำนวณ ถ้าให้แต่ละ repo method ยิง query ทีละครั้ง
 * ระหว่าง recursion จะกลายเป็น N+1 query และช้ามากเมื่อ BOM ลึกหรือกว้าง
 *
 * ดังนั้นไฟล์นี้ใช้แนวทาง "โหลดข้อมูลทั้งหมดที่ต้องใช้ล่วงหน้าในคำสั่งเดียว
 * (batch load)" ผ่าน loadCalculationContext() แล้วค่อยสร้าง repo object แบบ
 * synchronous (อ่านจาก Map ที่โหลดมาแล้ว) ส่งต่อให้ engine ใช้งานตามปกติ
 * ----------------------------------------------------------------------------
 */

const { wouldCreateCycle } = require('../engine/circularCheck');

/**
 * โหลด BOM ทั้ง Tree (ทุก Level) ที่ Active ณ asOfDate ของ rootProductIds
 * ในคำสั่งเดียว ด้วย Recursive CTE แล้วคืน repo object พร้อมใช้กับ
 * calculateMRP() / explodeBOM() ทันที
 *
 * @param {import('pg').Pool} pool
 * @param {Array<number>} rootProductIds  Product ที่ต้องการ Explode (จาก Forecast lines)
 * @param {string} asOfDate  วันที่อ้างอิงเลือก BOM Version (ISO date string)
 */
async function loadCalculationContext(pool, rootProductIds, asOfDate) {
  const bomTreeSql = `
    WITH RECURSIVE active_bom AS (
      SELECT DISTINCT ON (product_id) bom_id, product_id, version, effective_date
      FROM bom
      WHERE status = 'ACTIVE' AND effective_date <= $2::date
      ORDER BY product_id, effective_date DESC
    ),
    reachable(product_id) AS (
      SELECT unnest($1::int[])
      UNION
      SELECT bd.component_product_id
      FROM reachable r
      JOIN active_bom ab ON ab.product_id = r.product_id
      JOIN bom_detail bd ON bd.bom_id = ab.bom_id
      WHERE bd.component_type = 'SEMI_FINISHED' AND bd.component_product_id IS NOT NULL
    )
    SELECT
      ab.product_id      AS bom_product_id,
      ab.bom_id           AS bom_id,
      ab.version          AS version,
      ab.effective_date   AS effective_date,
      bd.bom_detail_id    AS bom_detail_id,
      bd.component_type   AS component_type,
      bd.component_product_id  AS component_product_id,
      bd.component_material_id AS component_material_id,
      bd.quantity         AS quantity,
      bd.loss_pct         AS loss_pct,
      bd.yield_pct        AS yield_pct,
      u.unit_code         AS unit
    FROM reachable r
    JOIN active_bom ab ON ab.product_id = r.product_id
    JOIN bom_detail bd ON bd.bom_id = ab.bom_id
    LEFT JOIN units u ON u.unit_id = bd.unit_id;
  `;

  const { rows: bomRows } = await pool.query(bomTreeSql, [rootProductIds, asOfDate]);

  // ---- จัดกลุ่มเป็น boms map: { [productId]: { bomId, version, details: [...] } }
  const boms = new Map();
  const materialIds = new Set();
  const semiFinishedIds = new Set();

  for (const row of bomRows) {
    const pid = row.bom_product_id;
    semiFinishedIds.add(pid);
    if (!boms.has(pid)) {
      boms.set(pid, { bomId: row.bom_id, version: row.version, effectiveDate: row.effective_date, details: [] });
    }
    const isSemi = row.component_type === 'SEMI_FINISHED';
    const componentId = isSemi ? row.component_product_id : row.component_material_id;
    if (isSemi) semiFinishedIds.add(componentId);
    else materialIds.add(componentId);

    boms.get(pid).details.push({
      bomDetailId: row.bom_detail_id,
      componentType: row.component_type,
      componentId,
      quantity: Number(row.quantity),
      unit: row.unit,
      lossPct: row.loss_pct === null ? 0 : Number(row.loss_pct),
      yieldPct: row.yield_pct === null ? 100 : Number(row.yield_pct),
    });
  }
  // root products ที่ไม่มี BOM เลย (เป็น leaf) ก็ต้องอยู่ใน "productsOfInterest" สำหรับ stock lookup
  for (const rid of rootProductIds) semiFinishedIds.add(rid);

  const materialIdList = Array.from(materialIds);
  const semiFinishedIdList = Array.from(semiFinishedIds);

  // ---- Batch load Material master (safety stock, conversion rate, price)
  const materialsById = new Map();
  if (materialIdList.length > 0) {
    const { rows } = await pool.query(
      `SELECT material_id, safety_stock, conversion_rate, current_price
       FROM materials WHERE material_id = ANY($1::int[])`,
      [materialIdList]
    );
    for (const r of rows) {
      materialsById.set(r.material_id, {
        safetyStock: Number(r.safety_stock || 0),
        conversionRate: Number(r.conversion_rate || 1),
        price: Number(r.current_price || 0),
      });
    }
  }

  // ---- Batch load Stock (แยก material / semi-finished)
  const stockByMaterial = new Map();
  const stockBySemiFinished = new Map();
  {
    const { rows } = await pool.query(
      `SELECT material_id, semi_finished_product_id, on_hand_qty
       FROM stock
       WHERE material_id = ANY($1::int[]) OR semi_finished_product_id = ANY($2::int[])`,
      [materialIdList, semiFinishedIdList]
    );
    for (const r of rows) {
      if (r.material_id != null) stockByMaterial.set(r.material_id, Number(r.on_hand_qty || 0));
      if (r.semi_finished_product_id != null) stockBySemiFinished.set(r.semi_finished_product_id, Number(r.on_hand_qty || 0));
    }
  }

  // ---- Batch load Open PO (ยอดคงค้างต่อ Material: ordered - received ของ PO ที่ยังไม่ปิด/ยกเลิก)
  const openPoByMaterial = new Map();
  if (materialIdList.length > 0) {
    const { rows } = await pool.query(
      `SELECT pod.material_id, SUM(pod.ordered_qty - pod.received_qty) AS open_qty
       FROM purchase_order_detail pod
       JOIN purchase_order po ON po.po_id = pod.po_id
       WHERE po.status NOT IN ('CANCELLED', 'RECEIVED')
         AND pod.material_id = ANY($1::int[])
       GROUP BY pod.material_id`,
      [materialIdList]
    );
    for (const r of rows) openPoByMaterial.set(r.material_id, Number(r.open_qty || 0));
  }

  // TODO: Open Production (Semi-Finished) และ Scheduled Receipt ยังไม่มีตารางรองรับ
  // โดยตรงในสคีมาปัจจุบัน (ต่อยอดได้ในอนาคตตาม STEP 32 ของ Phase 1 เมื่อทำ
  // Production Planning module) — ปัจจุบัน default เป็น 0
  const openProductionBySemiFinished = new Map();
  const scheduledReceiptById = new Map();

  return {
    getActiveBom(productId) {
      return boms.get(productId) || null;
    },
    getStock(type, id) {
      return type === 'SEMI_FINISHED' ? stockBySemiFinished.get(id) || 0 : stockByMaterial.get(id) || 0;
    },
    getSafetyStock(id) {
      const m = materialsById.get(id);
      return m ? m.safetyStock : 0;
    },
    getOpenPoQty(id) {
      return openPoByMaterial.get(id) || 0;
    },
    getOpenProductionQty(id) {
      return openProductionBySemiFinished.get(id) || 0;
    },
    getScheduledReceipt(id) {
      return scheduledReceiptById.get(id) || 0;
    },
    getConversionRate(id) {
      const m = materialsById.get(id);
      return m ? m.conversionRate : 1;
    },
    getMaterialPrice(id) {
      const m = materialsById.get(id);
      return m ? m.price : 0;
    },
  };
}

/**
 * โหลดกราฟความสัมพันธ์ "Product ใช้ Semi-Finished ตัวไหนเป็น Component" ทั้งระบบ
 * (เฉพาะ BOM ที่ Active ณ asOfDate) ในคำสั่งเดียว ใช้สำหรับตรวจ Circular Reference
 * ก่อนบันทึก BOM_DETAIL แถวใหม่ (STEP 35)
 */
async function loadSemiFinishedGraph(pool, asOfDate) {
  const { rows } = await pool.query(
    `SELECT b.product_id AS parent_id, bd.component_product_id AS child_id
     FROM bom b
     JOIN bom_detail bd ON bd.bom_id = b.bom_id
     WHERE b.status = 'ACTIVE' AND b.effective_date <= $1::date
       AND bd.component_type = 'SEMI_FINISHED' AND bd.component_product_id IS NOT NULL`,
    [asOfDate]
  );
  const graph = new Map();
  for (const r of rows) {
    if (!graph.has(r.parent_id)) graph.set(r.parent_id, []);
    graph.get(r.parent_id).push(r.child_id);
  }
  return graph;
}

/**
 * ตรวจว่าการเพิ่ม BOM_DETAIL ใหม่ (parentProductId ใช้ componentProductId เป็น
 * Semi-Finished component) จะทำให้เกิด Circular Reference หรือไม่ — เรียกก่อน
 * INSERT/UPDATE ทุกครั้งที่ component_type = 'SEMI_FINISHED'
 *
 * @returns {Promise<boolean>} true = จะเกิด cycle ต้อง Reject การบันทึก
 */
async function checkNewBomEdgeForCycle(pool, parentProductId, componentProductId, asOfDate) {
  const graph = await loadSemiFinishedGraph(pool, asOfDate);
  return wouldCreateCycle(parentProductId, componentProductId, (pid) => graph.get(pid) || []);
}

module.exports = { loadCalculationContext, loadSemiFinishedGraph, checkNewBomEdgeForCycle };
