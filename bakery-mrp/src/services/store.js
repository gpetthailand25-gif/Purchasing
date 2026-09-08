'use strict';

const { calculateMRP, calculateIncrementalMRP } = require('../engine/mrpCalculation');
const { calculateBomCost } = require('../engine/bomExplosion');
const { wouldCreateCycle, CircularBomError } = require('../engine/circularCheck');
const { calculateReceivingStatus, calculateOverdue } = require('../engine/poTracking');
const { HttpError } = require('../api/router');

/**
 * createStore()
 * ----------------------------------------------------------------------------
 * Application state แบบ In-Memory สำหรับรัน API ได้จริงในสภาพแวดล้อมที่ยังไม่มี
 * PostgreSQL ต่ออยู่ (ใน Production ให้แทนที่ด้วย src/db/repository.js ตามที่ทำไว้
 * ในขั้นก่อนหน้า — โครงสร้างข้อมูล/สูตรคำนวณเหมือนกันทุกประการ)
 * ----------------------------------------------------------------------------
 */
function createStore() {
  // ---- Seed Master Data (ตรงกับ Test Data ที่ใช้ตรวจทาน Engine มาตลอด) ----
  const boms = {
    P003: {
      version: 'v1.0',
      effectiveDate: '2026-01-01',
      details: [
        { bomDetailId: 'd1', componentType: 'RAW_MATERIAL', componentId: 'M001', quantity: 0.025, unit: 'kg', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd2', componentType: 'RAW_MATERIAL', componentId: 'M002', quantity: 0.010, unit: 'kg', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd3', componentType: 'RAW_MATERIAL', componentId: 'M003', quantity: 0.002, unit: 'kg', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd4', componentType: 'RAW_MATERIAL', componentId: 'M004', quantity: 0.008, unit: 'kg', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd5', componentType: 'RAW_MATERIAL', componentId: 'M005', quantity: 0.015, unit: 'kg', lossPct: 0, yieldPct: 100 },
      ],
    },
    P001: {
      version: 'v1.0',
      effectiveDate: '2026-01-01',
      details: [
        { bomDetailId: 'd6', componentType: 'SEMI_FINISHED', componentId: 'P003', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd7', componentType: 'RAW_MATERIAL', componentId: 'M007', quantity: 0.020, unit: 'kg', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd8', componentType: 'PACKAGING', componentId: 'M006', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
      ],
    },
    P002: {
      version: 'v1.0',
      effectiveDate: '2026-01-01',
      details: [
        { bomDetailId: 'd9', componentType: 'SEMI_FINISHED', componentId: 'P003', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd10', componentType: 'RAW_MATERIAL', componentId: 'M008', quantity: 0.015, unit: 'kg', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd11', componentType: 'PACKAGING', componentId: 'M006', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
      ],
    },
    P004: {
      version: 'v1.0',
      effectiveDate: '2026-01-01',
      details: [
        { bomDetailId: 'd12', componentType: 'SEMI_FINISHED', componentId: 'P003', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd13', componentType: 'RAW_MATERIAL', componentId: 'M009', quantity: 0.018, unit: 'kg', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd14', componentType: 'PACKAGING', componentId: 'M006', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
      ],
    },
    P005: {
      version: 'v1.0',
      effectiveDate: '2026-01-01',
      details: [
        { bomDetailId: 'd15', componentType: 'SEMI_FINISHED', componentId: 'P003', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd16', componentType: 'RAW_MATERIAL', componentId: 'M010', quantity: 0.018, unit: 'kg', lossPct: 0, yieldPct: 100 },
        { bomDetailId: 'd17', componentType: 'PACKAGING', componentId: 'M006', quantity: 1, unit: 'pcs', lossPct: 0, yieldPct: 100 },
      ],
    },
  };

  const products = {
    P001: { name: 'ขนมปังไส้หมูหยอง', type: 'FINISHED' },
    P002: { name: 'ขนมปังไส้แยม', type: 'FINISHED' },
    P004: { name: 'ขนมปังไส้ครีม', type: 'FINISHED' },
    P005: { name: 'ขนมปังไส้สังขยา', type: 'FINISHED' },
    P003: { name: 'ขนมปังอบสำเร็จรูป', type: 'SEMI_FINISHED' },
  };

  const materials = {
    M001: { name: 'แป้ง', safetyStock: 30, conversionRate: 25, price: 27 },
    M002: { name: 'น้ำตาล', safetyStock: 20, conversionRate: 25, price: 22 },
    M003: { name: 'ยีสต์', safetyStock: 5, conversionRate: 5, price: 180 },
    M004: { name: 'เนย', safetyStock: 20, conversionRate: 10, price: 130 },
    M005: { name: 'นม', safetyStock: 10, conversionRate: 12, price: 45 },
    M006: { name: 'Packaging', safetyStock: 500, conversionRate: 1, price: 3.5 },
    M007: { name: 'ไส้หมูหยอง', safetyStock: 5, conversionRate: 1, price: 90 },
    M008: { name: 'แยม', safetyStock: 5, conversionRate: 1, price: 60 },
    M009: { name: 'ครีม', safetyStock: 5, conversionRate: 1, price: 95 },
    M010: { name: 'สังขยา', safetyStock: 5, conversionRate: 1, price: 85 },
  };

  const stock = {
    M001: 100, M002: 500, M003: 50, M004: 30, M005: 300, M006: 2000,
    M007: 200, M008: 200, M009: 150, M010: 150, P003: 0,
  };

  // ---- Mutable transactional state ----
  const suppliers = {
    'SUP-A': { name: 'บริษัท ไทยเฟลาว์ จำกัด', leadTimeDays: 5 },
    'SUP-B': { name: 'บริษัท แพ็คโปร ซัพพลาย จำกัด', leadTimeDays: 3 },
    'SUP-C': { name: 'ฟาร์มโคนมสยาม', leadTimeDays: 2 },
  };

  const forecasts = new Map(); // key: `${year}-${month}-${productId}` -> { quantity, revisions: [], adjustments: [] }
  const purchaseOrders = []; // { poId, supplierId, poDate, expectedDeliveryDate, status, lines: [{materialId, orderedQty, unitPrice, receivedQty}] }
  const priceHistory = []; // { materialId, supplierId, fromPrice, toPrice, date } — บันทึกอัตโนมัติเมื่อราคาใน PO ต่างจากราคาล่าสุดที่รู้จัก
  let nextPoId = 1;

  function forecastKey(year, month, productId) {
    return `${year}-${month}-${productId}`;
  }

  // ---- Repository interface สำหรับ Engine (เหมือนกับ src/db/repository.js แต่อ่านจาก Memory) ----
  function toEngineRepo(asOfDate) {
    return {
      getActiveBom(productId) {
        const bom = boms[productId];
        if (!bom || new Date(bom.effectiveDate) > new Date(asOfDate)) return null;
        return bom;
      },
      getStock(type, id) {
        return stock[id] || 0;
      },
      getSafetyStock(id) {
        return (materials[id] && materials[id].safetyStock) || 0;
      },
      getOpenPoQty(materialId) {
        let sum = 0;
        for (const po of purchaseOrders) {
          if (po.status === 'CANCELLED' || po.status === 'RECEIVED') continue;
          for (const line of po.lines) {
            if (line.materialId === materialId) sum += line.orderedQty - line.receivedQty;
          }
        }
        return sum;
      },
      getOpenProductionQty() {
        return 0; // ยังไม่มี Production Planning module (ดู README)
      },
      getScheduledReceipt() {
        return 0;
      },
      getConversionRate(id) {
        return (materials[id] && materials[id].conversionRate) || 1;
      },
      getMaterialPrice(id) {
        return (materials[id] && materials[id].price) || 0;
      },
      getSemiFinishedChildren(productId) {
        const bom = boms[productId];
        if (!bom) return [];
        return bom.details.filter((d) => d.componentType === 'SEMI_FINISHED').map((d) => d.componentId);
      },
    };
  }

  // ==== Forecast ====
  function upsertForecast({ year, month, productId, quantity, enteredBy, note }) {
    if (!products[productId]) throw new HttpError(400, `ไม่พบ Product: ${productId}`);
    const key = forecastKey(year, month, productId);
    const existing = forecasts.get(key);
    if (!existing) {
      forecasts.set(key, {
        year, month, productId, quantity,
        revisions: [{ versionNo: 1, quantity, revisedBy: enteredBy, note, revisedDate: new Date().toISOString() }],
        adjustments: [],
      });
      return forecasts.get(key);
    }
    const versionNo = existing.revisions.length + 1;
    existing.revisions.push({ versionNo, quantity, revisedBy: enteredBy, note, revisedDate: new Date().toISOString() });
    existing.quantity = quantity;
    return existing;
  }

  function addForecastAdjustment({ year, month, productId, additionalQty, customerChannel, note, enteredBy }) {
    const key = forecastKey(year, month, productId);
    const existing = forecasts.get(key);
    if (!existing) throw new HttpError(404, 'ไม่พบ Forecast หลักของช่วงเวลานี้ กรุณากรอก Forecast ประจำเดือนก่อน');
    const adjustment = { additionalQty, customerChannel, note, enteredBy, adjustDate: new Date().toISOString() };
    existing.adjustments.push(adjustment);
    return adjustment;
  }

  function listForecast(year, month) {
    return Array.from(forecasts.values()).filter((f) => f.year === Number(year) && f.month === Number(month));
  }

  // ==== MRP ====
  function calculateMrpForPeriod(year, month, asOfDate) {
    const lines = listForecast(year, month);
    if (lines.length === 0) throw new HttpError(404, 'ไม่พบ Forecast ของช่วงเวลานี้');

    const repo = toEngineRepo(asOfDate);

    const baseLines = lines.map((f) => ({ productId: f.productId, quantity: f.quantity }));
    const base = calculateMRP(baseLines, asOfDate, repo);

    const adjustmentLines = lines
      .filter((f) => f.adjustments.length > 0)
      .map((f) => ({ productId: f.productId, quantity: f.adjustments.reduce((s, a) => s + a.additionalQty, 0) }));
    const incremental = adjustmentLines.length > 0 ? calculateIncrementalMRP(adjustmentLines, asOfDate, repo) : [];

    return { base, incremental };
  }

  // ==== BOM ====
  function getBomTree(productId, asOfDate) {
    const bom = boms[productId];
    if (!bom || new Date(bom.effectiveDate) > new Date(asOfDate)) return null;
    return {
      productId,
      productName: products[productId] ? products[productId].name : productId,
      version: bom.version,
      components: bom.details.map((d) => ({
        bomDetailId: d.bomDetailId,
        componentType: d.componentType,
        componentId: d.componentId,
        name: d.componentType === 'SEMI_FINISHED' ? (products[d.componentId] || {}).name : (materials[d.componentId] || {}).name,
        quantity: d.quantity,
        unit: d.unit,
        lossPct: d.lossPct,
        yieldPct: d.yieldPct,
        children: d.componentType === 'SEMI_FINISHED' ? getBomTree(d.componentId, asOfDate) : null,
      })),
    };
  }

  function whereUsed(componentType, componentId) {
    const usedIn = [];
    for (const [productId, bom] of Object.entries(boms)) {
      const found = bom.details.some((d) => d.componentType === componentType && d.componentId === componentId);
      if (found) usedIn.push({ productId, productName: (products[productId] || {}).name });
    }
    return usedIn;
  }

  let nextBomDetailId = 1000; // seed data ใช้ d1..d17 อยู่แล้ว เริ่มเลขสูงกว่านั้นเพื่อไม่ชนกัน

  function addBomDetail(productId, detail, asOfDate) {
    if (detail.componentType === 'SEMI_FINISHED') {
      const repo = toEngineRepo(asOfDate);
      const cycle = wouldCreateCycle(productId, detail.componentId, (pid) => repo.getSemiFinishedChildren(pid));
      if (cycle) throw new CircularBomError([productId, detail.componentId]);
    }
    if (!boms[productId]) boms[productId] = { version: 'v1.0', effectiveDate: asOfDate, details: [] };
    const bomDetailId = 'd' + nextBomDetailId++;
    boms[productId].details.push({ bomDetailId, ...detail });
    return boms[productId];
  }

  function removeBomDetail(productId, bomDetailId) {
    if (!boms[productId]) throw new HttpError(404, `ไม่พบ BOM ของ ${productId}`);
    const before = boms[productId].details.length;
    boms[productId].details = boms[productId].details.filter((d) => d.bomDetailId !== bomDetailId);
    if (boms[productId].details.length === before) {
      throw new HttpError(404, `ไม่พบ Component id=${bomDetailId} ใน BOM ของ ${productId}`);
    }
    return boms[productId];
  }

  // ==== Purchase Order / Receiving ====
  function createPurchaseOrder({ supplierId, expectedDeliveryDate, lines }) {
    const poId = nextPoId++;
    const poDate = new Date().toISOString().slice(0, 10);

    for (const l of lines) {
      const material = materials[l.materialId];
      if (material && material.price !== l.unitPrice) {
        priceHistory.push({ materialId: l.materialId, supplierId, fromPrice: material.price, toPrice: l.unitPrice, date: poDate });
        material.price = l.unitPrice; // current_price สะท้อนราคาซื้อล่าสุดเสมอ (STEP 19/23 ของ Phase 1)
      }
    }

    const po = {
      poId,
      poNumber: `PO-${String(poId).padStart(6, '0')}`,
      supplierId,
      poDate,
      expectedDeliveryDate,
      status: 'APPROVED',
      lines: lines.map((l) => ({ materialId: l.materialId, orderedQty: l.orderedQty, unitPrice: l.unitPrice, receivedQty: 0 })),
    };
    purchaseOrders.push(po);
    return po;
  }

  function getPurchaseOrder(poId) {
    const po = purchaseOrders.find((p) => p.poId === Number(poId));
    if (!po) throw new HttpError(404, `ไม่พบ PO id=${poId}`);
    return po;
  }

  function listPurchaseOrdersTracking(today = new Date()) {
    return purchaseOrders.map((po) => {
      const lineStatuses = po.lines.map((l) => {
        const { outstanding, status } = calculateReceivingStatus(l.orderedQty, l.receivedQty);
        return { ...l, outstanding, status };
      });
      const fullyReceived = lineStatuses.every((l) => l.status === 'Received');
      const overdue = calculateOverdue(new Date(po.expectedDeliveryDate), today, fullyReceived);
      return { ...po, lines: lineStatuses, fullyReceived, ...overdue };
    });
  }

  function receiveGoods(poId, receivedLines) {
    const po = getPurchaseOrder(poId);
    for (const rl of receivedLines) {
      const line = po.lines.find((l) => l.materialId === rl.materialId);
      if (!line) throw new HttpError(400, `PO นี้ไม่มี Material ${rl.materialId}`);
      line.receivedQty = Math.min(line.orderedQty, line.receivedQty + rl.receivedQty);
      stock[rl.materialId] = (stock[rl.materialId] || 0) + rl.receivedQty; // อัปเดต Stock ทันที
    }
    const allReceived = po.lines.every((l) => l.receivedQty >= l.orderedQty);
    const anyReceived = po.lines.some((l) => l.receivedQty > 0);
    po.status = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.status;
    return po;
  }

  // ==== Dashboard ====

  function trackedPOs(today) {
    return listPurchaseOrdersTracking(today);
  }

  function isOpenPO(po) {
    return po.status !== 'RECEIVED' && po.status !== 'CANCELLED';
  }

  function poLineValue(l) {
    return l.orderedQty * l.unitPrice;
  }
  function poOutstandingValue(l) {
    return (l.orderedQty - l.receivedQty) * l.unitPrice;
  }
  function poReceivedValue(l) {
    return l.receivedQty * l.unitPrice;
  }

  /** MRP ของช่วงเวลาที่ระบุ แต่ไม่ throw ถ้ายังไม่มี Forecast (คืน [] แทน) — ใช้เฉพาะฝั่ง Dashboard */
  function calculateMrpForPeriodSafe(year, month, asOfDate) {
    try {
      return calculateMrpForPeriod(year, month, asOfDate);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return { base: [], incremental: [] };
      throw e;
    }
  }

  function getDashboardPurchasing(year, month, asOfDate, today = new Date()) {
    const mrp = calculateMrpForPeriodSafe(year, month, asOfDate);
    const allMrpItems = [...mrp.base, ...mrp.incremental];
    const toOrder = allMrpItems.filter((r) => r.netRequirement > 0);

    const pos = trackedPOs(today);
    const openPOs = pos.filter(isOpenPO);

    const openPoValue = openPOs.reduce((s, po) => s + po.lines.reduce((ls, l) => ls + poLineValue(l), 0), 0);
    const receivedValue = pos.reduce((s, po) => s + po.lines.reduce((ls, l) => ls + poReceivedValue(l), 0), 0);
    const outstandingValue = openPOs.reduce((s, po) => s + po.lines.reduce((ls, l) => ls + poOutstandingValue(l), 0), 0);
    const overduePOs = pos.filter((po) => po.isOverdue);
    const overdueValue = overduePOs.reduce((s, po) => s + po.lines.reduce((ls, l) => ls + poOutstandingValue(l), 0), 0);

    const materialsBelowSafety = Object.entries(materials)
      .filter(([id, m]) => (stock[id] || 0) < m.safetyStock)
      .map(([id, m]) => ({
        materialId: id,
        name: m.name,
        stock: stock[id] || 0,
        safetyStock: m.safetyStock,
        level: (stock[id] || 0) < m.safetyStock * 0.5 ? 'critical' : 'warning',
      }));

    const dueSoonMs = 3 * 24 * 60 * 60 * 1000; // "ใกล้ครบกำหนด" = ภายใน 3 วัน
    const dueSoon = openPOs.filter((po) => !po.isOverdue && !po.fullyReceived &&
      new Date(po.expectedDeliveryDate).getTime() - today.getTime() <= dueSoonMs &&
      new Date(po.expectedDeliveryDate).getTime() - today.getTime() >= 0);

    return {
      period: { year: Number(year), month: Number(month) },
      kpis: {
        itemsToOrder: toOrder.length,
        valueToOrder: round2(toOrder.reduce((s, r) => s + r.requirementValue, 0)),
        openPoCount: openPOs.length,
        openPoValue: round2(openPoValue),
        receivedValue: round2(receivedValue),
        outstandingValue: round2(outstandingValue),
        overdueValue: round2(overdueValue),
        belowSafetyStockCount: materialsBelowSafety.length,
      },
      actionRequired: {
        openPo: toOrder.length,
        pendingApproval: pos.filter((po) => po.status === 'PENDING_APPROVAL').length,
        pendingSendToSupplier: pos.filter((po) => po.status === 'APPROVED').length,
        dueSoon: dueSoon.length,
        overduePo: overduePOs.length,
        materialAtRisk: materialsBelowSafety.length,
      },
      materialsBelowSafety,
    };
  }

  function getDashboardExecutive(year, month, asOfDate, today = new Date()) {
    const mrp = calculateMrpForPeriodSafe(year, month, asOfDate);
    const allMrpItems = [...mrp.base, ...mrp.incremental];

    const forecastLines = listForecast(year, month);
    const repo = toEngineRepo(asOfDate);
    const forecastValue = forecastLines.reduce((s, f) => s + f.quantity * calculateBomCost(f.productId, asOfDate, repo), 0);
    const requirementValue = allMrpItems.reduce((s, r) => s + r.grossRequirement * ((materials[r.id] || {}).price || 0), 0);

    const pos = trackedPOs(today);
    const openPOs = pos.filter(isOpenPO);
    const actualPurchaseValue = pos
      .filter((po) => sameMonth(po.poDate, year, month))
      .reduce((s, po) => s + po.lines.reduce((ls, l) => ls + poLineValue(l), 0), 0);
    const openPoValue = openPOs.reduce((s, po) => s + po.lines.reduce((ls, l) => ls + poLineValue(l), 0), 0);
    const receivedValue = pos.reduce((s, po) => s + po.lines.reduce((ls, l) => ls + poReceivedValue(l), 0), 0);
    const outstandingValue = openPOs.reduce((s, po) => s + po.lines.reduce((ls, l) => ls + poOutstandingValue(l), 0), 0);
    const overdueValue = pos.filter((po) => po.isOverdue).reduce((s, po) => s + po.lines.reduce((ls, l) => ls + poOutstandingValue(l), 0), 0);

    // มูลค่าการจัดซื้อรายเดือน — group ตาม po.poDate จริง (ข้อมูลจะโตขึ้นเรื่อย ๆ ตามการใช้งานจริง)
    const monthlyPurchase = groupByYearMonth(pos, (po) => po.lines.reduce((s, l) => s + poLineValue(l), 0));

    // Forecast vs Actual รายเดือน (เท่าที่มี Forecast บันทึกไว้)
    const forecastByMonth = new Map();
    for (const [key, f] of forecastEntriesByPeriod()) {
      const lineForecastValue = f.quantity * calculateBomCost(f.productId, asOfDate, toEngineRepo(asOfDate));
      forecastByMonth.set(key, (forecastByMonth.get(key) || 0) + lineForecastValue);
    }
    const actualByMonth = groupByYearMonth(pos, (po) => po.lines.reduce((s, l) => s + poLineValue(l), 0));
    const forecastVsActual = mergeMonthlySeries(forecastByMonth, actualByMonth);

    const openPoBySupplier = groupBySupplier(openPOs, (po) => po.lines.reduce((s, l) => s + poLineValue(l), 0));
    const outstandingBySupplier = groupBySupplier(openPOs, (po) => po.lines.reduce((s, l) => s + poOutstandingValue(l), 0));

    const topMaterials = topMaterialsByPurchaseValue(pos);

    const recentPriceIncreases = priceHistory
      .filter((p) => p.toPrice > p.fromPrice)
      .slice(-10)
      .reverse()
      .map((p) => ({
        materialId: p.materialId,
        material: (materials[p.materialId] || {}).name,
        from: p.fromPrice,
        to: p.toPrice,
        pct: round2(((p.toPrice - p.fromPrice) / p.fromPrice) * 100),
        supplier: (suppliers[p.supplierId] || {}).name,
        date: p.date,
      }));

    const materialRisk = Object.entries(materials)
      .filter(([id, m]) => (stock[id] || 0) < m.safetyStock)
      .map(([id, m]) => ({
        materialId: id,
        material: m.name,
        stock: stock[id] || 0,
        safetyStock: m.safetyStock,
        level: (stock[id] || 0) < m.safetyStock * 0.5 ? 'critical' : 'warning',
      }));

    return {
      period: { year: Number(year), month: Number(month) },
      kpis: {
        forecastValue: round2(forecastValue),
        requirementValue: round2(requirementValue),
        actualPurchaseValue: round2(actualPurchaseValue),
        openPoValue: round2(openPoValue),
        receivedValue: round2(receivedValue),
        outstandingPoValue: round2(outstandingValue),
        overduePoValue: round2(overdueValue),
      },
      charts: {
        monthlyPurchase,
        forecastVsActual,
        openPoBySupplier,
        outstandingBySupplier,
        topMaterials,
      },
      priceIncreases: recentPriceIncreases,
      materialRisk,
    };
  }

  function forecastEntriesByPeriod() {
    return Array.from(forecasts.entries()).map(([key, f]) => [`${f.year}-${String(f.month).padStart(2, '0')}`, f]);
  }
  function sameMonth(dateStr, year, month) {
    const d = new Date(dateStr);
    return d.getFullYear() === Number(year) && d.getMonth() + 1 === Number(month);
  }
  function groupByYearMonth(pos, valueFn) {
    const map = new Map();
    for (const po of pos) {
      const key = po.poDate.slice(0, 7); // YYYY-MM
      map.set(key, (map.get(key) || 0) + valueFn(po));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value: round2(value) }));
  }
  function mergeMonthlySeries(forecastMap, actualSeries) {
    const keys = new Set([...forecastMap.keys(), ...actualSeries.map((a) => a.month)]);
    const actualMap = new Map(actualSeries.map((a) => [a.month, a.value]));
    return Array.from(keys).sort().map((month) => ({
      month,
      forecast: round2(forecastMap.get(month) || 0),
      actual: round2(actualMap.get(month) || 0),
    }));
  }
  function groupBySupplier(pos, valueFn) {
    const map = new Map();
    for (const po of pos) {
      map.set(po.supplierId, (map.get(po.supplierId) || 0) + valueFn(po));
    }
    return Array.from(map.entries())
      .map(([supplierId, value]) => ({ supplierId, supplier: (suppliers[supplierId] || {}).name, value: round2(value) }))
      .sort((a, b) => b.value - a.value);
  }
  function topMaterialsByPurchaseValue(pos) {
    const map = new Map();
    for (const po of pos) {
      for (const l of po.lines) {
        map.set(l.materialId, (map.get(l.materialId) || 0) + poLineValue(l));
      }
    }
    return Array.from(map.entries())
      .map(([materialId, value]) => ({ materialId, material: (materials[materialId] || {}).name, value: round2(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }
  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  return {
    products,
    materials,
    suppliers,
    upsertForecast,
    addForecastAdjustment,
    listForecast,
    calculateMrpForPeriod,
    getBomTree,
    whereUsed,
    addBomDetail,
    removeBomDetail,
    createPurchaseOrder,
    getPurchaseOrder,
    listPurchaseOrdersTracking,
    receiveGoods,
    getDashboardPurchasing,
    getDashboardExecutive,
  };
}

module.exports = { createStore };
