'use strict';

class CircularBomError extends Error {
  constructor(path) {
    super(`ไม่สามารถสร้าง BOM ได้ เนื่องจากเกิด Circular Reference: ${path.join(' -> ')}`);
    this.name = 'CircularBomError';
    this.path = path;
  }
}

/**
 * ตรวจว่าการเพิ่ม edge (parentProductId ใช้ componentProductId เป็น Semi-Finished component)
 * จะทำให้เกิด Circular Reference หรือไม่ โดยเดิน DFS จาก componentProductId ไปตาม
 * Semi-Finished component ที่มีอยู่แล้ว ถ้าย้อนกลับมาเจอ parentProductId แปลว่าเกิด Cycle
 *
 * @param {number|string} parentProductId
 * @param {number|string} componentProductId
 * @param {(productId: number|string) => Array<number|string>} getSemiFinishedChildren
 *        ฟังก์ชันคืนรายการ component_product_id (เฉพาะ SEMI_FINISHED) ของ BOM Active ปัจจุบันของ productId นั้น
 * @returns {boolean} true = จะเกิด cycle
 */
function wouldCreateCycle(parentProductId, componentProductId, getSemiFinishedChildren) {
  if (String(parentProductId) === String(componentProductId)) return true;

  const visited = new Set();

  function dfs(node) {
    if (String(node) === String(parentProductId)) return true;
    const key = String(node);
    if (visited.has(key)) return false;
    visited.add(key);
    const children = getSemiFinishedChildren(node) || [];
    for (const child of children) {
      if (dfs(child)) return true;
    }
    return false;
  }

  return dfs(componentProductId);
}

/**
 * เรียกใช้ก่อน INSERT/UPDATE bom_detail แถวใหม่ที่ component_type = SEMI_FINISHED
 * throw CircularBomError ถ้าจะทำให้เกิด Cycle
 */
function assertNoCycle(parentProductId, componentProductId, getSemiFinishedChildren) {
  if (wouldCreateCycle(parentProductId, componentProductId, getSemiFinishedChildren)) {
    throw new CircularBomError([parentProductId, componentProductId]);
  }
}

module.exports = { CircularBomError, wouldCreateCycle, assertNoCycle };
