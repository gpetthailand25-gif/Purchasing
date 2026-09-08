'use strict';

/**
 * Mock ของ `pg.Pool` — คืนแถวข้อมูลจำลอง (เหมือนยิง query จริงกับ Postgres)
 * ให้ตรงกับ Test Data ชุดเดียวกับ test/testData.js (buildBakeryRepo) เพื่อยืนยันว่า
 * repository.js map ผลลัพธ์จาก SQL ไปเป็น repo object ที่ Engine ใช้ได้ถูกต้อง
 *
 * Router: ตรวจ keyword เฉพาะใน SQL text เพื่อเลือกว่าจะคืน fixture ชุดไหน
 * (ไม่ได้รัน SQL จริง เพราะ sandbox นี้ไม่มี PostgreSQL server ให้เชื่อมต่อ)
 */
function createMockPool() {
  // อิงตัวเลขเดียวกับ test/testData.js::buildBakeryRepo()
  const bomTreeRows = [
    // BOM ของ P001 (ขนมปังไส้หมูหยอง) v1.0
    { bom_product_id: 1, bom_id: 101, version: 'v1.0', effective_date: '2026-01-01', bom_detail_id: 1, component_type: 'SEMI_FINISHED', component_product_id: 3, component_material_id: null, quantity: 1, loss_pct: 0, yield_pct: 100, unit: 'pcs' },
    { bom_product_id: 1, bom_id: 101, version: 'v1.0', effective_date: '2026-01-01', bom_detail_id: 2, component_type: 'RAW_MATERIAL', component_product_id: null, component_material_id: 7, quantity: 0.020, loss_pct: 0, yield_pct: 100, unit: 'kg' }, // ไส้หมูหยอง
    { bom_product_id: 1, bom_id: 101, version: 'v1.0', effective_date: '2026-01-01', bom_detail_id: 3, component_type: 'PACKAGING', component_product_id: null, component_material_id: 6, quantity: 1, loss_pct: 0, yield_pct: 100, unit: 'pcs' },
    // BOM ของ P002 (ขนมปังไส้แยม) v1.0
    { bom_product_id: 2, bom_id: 102, version: 'v1.0', effective_date: '2026-01-01', bom_detail_id: 4, component_type: 'SEMI_FINISHED', component_product_id: 3, component_material_id: null, quantity: 1, loss_pct: 0, yield_pct: 100, unit: 'pcs' },
    { bom_product_id: 2, bom_id: 102, version: 'v1.0', effective_date: '2026-01-01', bom_detail_id: 5, component_type: 'RAW_MATERIAL', component_product_id: null, component_material_id: 8, quantity: 0.015, loss_pct: 0, yield_pct: 100, unit: 'kg' }, // แยม
    { bom_product_id: 2, bom_id: 102, version: 'v1.0', effective_date: '2026-01-01', bom_detail_id: 6, component_type: 'PACKAGING', component_product_id: null, component_material_id: 6, quantity: 1, loss_pct: 0, yield_pct: 100, unit: 'pcs' },
    // BOM ของ P003 (ขนมปังอบสำเร็จรูป) v1.0
    { bom_product_id: 3, bom_id: 103, version: 'v1.0', effective_date: '2026-01-01', bom_detail_id: 7, component_type: 'RAW_MATERIAL', component_product_id: null, component_material_id: 1, quantity: 0.025, loss_pct: 0, yield_pct: 100, unit: 'kg' }, // แป้ง
    { bom_product_id: 3, bom_id: 103, version: 'v1.0', effective_date: '2026-01-01', bom_detail_id: 8, component_type: 'RAW_MATERIAL', component_product_id: null, component_material_id: 2, quantity: 0.010, loss_pct: 0, yield_pct: 100, unit: 'kg' }, // น้ำตาล
    { bom_product_id: 3, bom_id: 103, version: 'v1.0', effective_date: '2026-01-01', bom_detail_id: 9, component_type: 'RAW_MATERIAL', component_product_id: null, component_material_id: 4, quantity: 0.008, loss_pct: 0, yield_pct: 100, unit: 'kg' }, // เนย
  ];

  const materialsRows = [
    { material_id: 1, safety_stock: 30, conversion_rate: 25, current_price: 27 }, // แป้ง
    { material_id: 2, safety_stock: 0, conversion_rate: 25, current_price: 22 },  // น้ำตาล
    { material_id: 4, safety_stock: 20, conversion_rate: 10, current_price: 130 }, // เนย
    { material_id: 6, safety_stock: 500, conversion_rate: 1, current_price: 3.5 }, // Packaging
    { material_id: 7, safety_stock: 0, conversion_rate: 1, current_price: 90 },   // ไส้หมูหยอง
    { material_id: 8, safety_stock: 0, conversion_rate: 1, current_price: 60 },   // แยม
  ];

  const stockRows = [
    { material_id: 1, semi_finished_product_id: null, on_hand_qty: 100 },   // แป้ง
    { material_id: 4, semi_finished_product_id: null, on_hand_qty: 30 },    // เนย
    { material_id: 6, semi_finished_product_id: null, on_hand_qty: 2000 },  // Packaging
    { material_id: null, semi_finished_product_id: 3, on_hand_qty: 0 },     // Bread Base
  ];

  const openPoRows = [
    { material_id: 1, open_qty: 50 }, // แป้ง
    { material_id: 4, open_qty: 20 }, // เนย
    { material_id: 6, open_qty: 5000 }, // Packaging
  ];

  return {
    async query(text, params) {
      if (text.includes('reachable')) {
        // จำลอง WHERE product_id = ANY($1) โดย filter ตาม root ids ที่ขอมา + เดินตาม semi-finished
        const rootIds = params[0];
        const byProduct = groupBy(bomTreeRows, (r) => r.bom_product_id);
        const visited = new Set();
        const queue = [...rootIds];
        const result = [];
        while (queue.length) {
          const pid = queue.shift();
          if (visited.has(pid)) continue;
          visited.add(pid);
          const rows = byProduct.get(pid) || [];
          result.push(...rows);
          for (const r of rows) {
            if (r.component_type === 'SEMI_FINISHED' && r.component_product_id != null) {
              queue.push(r.component_product_id);
            }
          }
        }
        return { rows: result };
      }

      if (text.includes('FROM materials')) {
        const ids = new Set(params[0]);
        return { rows: materialsRows.filter((r) => ids.has(r.material_id)) };
      }

      if (text.includes('FROM stock')) {
        const materialIds = new Set(params[0]);
        const semiIds = new Set(params[1]);
        return {
          rows: stockRows.filter(
            (r) => (r.material_id != null && materialIds.has(r.material_id)) ||
                   (r.semi_finished_product_id != null && semiIds.has(r.semi_finished_product_id))
          ),
        };
      }

      if (text.includes('purchase_order_detail')) {
        const ids = new Set(params[0]);
        return { rows: openPoRows.filter((r) => ids.has(r.material_id)) };
      }

      throw new Error(`Mock pool: ไม่รู้จัก query นี้: ${text.slice(0, 60)}...`);
    },
  };
}

function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

module.exports = { createMockPool };
