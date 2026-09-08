'use strict';

/**
 * คำนวณ Outstanding และ Status ของ PO Line จากยอดสั่งและยอดรับสะสม (STEP 26)
 */
function calculateReceivingStatus(orderedQty, receivedQty) {
  const outstanding = Math.max(0, round3(orderedQty - receivedQty));
  let status;
  if (receivedQty <= 0) status = 'Not Received';
  else if (outstanding > 0) status = 'Partially Received';
  else status = 'Received';
  return { outstanding, status };
}

/**
 * คำนวณสถานะ Overdue ของ PO (STEP 27)
 * @param {Date} expectedDeliveryDate
 * @param {Date} today
 * @param {boolean} isFullyReceived
 */
function calculateOverdue(expectedDeliveryDate, today, isFullyReceived) {
  if (isFullyReceived) return { isOverdue: false, delayDays: 0 };
  const msPerDay = 24 * 60 * 60 * 1000;
  const delayDays = Math.floor((today.getTime() - expectedDeliveryDate.getTime()) / msPerDay);
  return { isOverdue: delayDays > 0, delayDays: Math.max(0, delayDays) };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

module.exports = { calculateReceivingStatus, calculateOverdue };
