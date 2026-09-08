import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { fmt, fmtBaht, KpiCard, LoadingState, ErrorState } from '../components/ui.jsx';

const STATUS_LABEL = {
  DRAFT: 'Draft', PENDING_APPROVAL: 'รออนุมัติ', APPROVED: 'อนุมัติแล้ว', SENT: 'ส่ง Supplier แล้ว',
  PARTIALLY_RECEIVED: 'รับบางส่วน', RECEIVED: 'รับครบแล้ว', CANCELLED: 'ยกเลิก',
};
const STATUS_COLOR = {
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-500/10',
  PENDING_APPROVAL: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  APPROVED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  SENT: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  PARTIALLY_RECEIVED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  RECEIVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-600/20',
};

export default function PoTrackingPage() {
  const [pos, setPos] = useState(null);
  const [suppliers, setSuppliers] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [error, setError] = useState(null);
  const [expandedPoId, setExpandedPoId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [poList, supplierList, materialList] = await Promise.all([api.listPurchaseOrders(), api.getSuppliers(), api.getMaterials()]);
      setPos(poList); setSuppliers(supplierList); setMaterials(materialList);
    } catch (e) { setError(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!pos || !suppliers || !materials) return <LoadingState />;

  const totalValue = pos.reduce((s, po) => s + po.lines.reduce((ls, l) => ls + l.orderedQty * l.unitPrice, 0), 0);
  const outstandingValue = pos.reduce((s, po) => s + po.lines.reduce((ls, l) => ls + l.outstanding * l.unitPrice, 0), 0);
  const overdueCount = pos.filter((po) => po.isOverdue).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Bakery Purchasing</p>
          <h1 className="font-display mt-1 text-2xl font-semibold text-slate-900">PO Tracking</h1>
        </div>
        <Link to="/po/new" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700">
          <Plus size={16} /> สร้าง PO
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="มูลค่า PO ทั้งหมด" value={fmtBaht(totalValue)} />
        <KpiCard label="มูลค่าคงค้าง (Outstanding)" value={fmtBaht(outstandingValue)} />
        <KpiCard label="PO เกินกำหนด (Overdue)" value={overdueCount} suffix="ใบ" tone={overdueCount > 0 ? 'critical' : 'ok'} />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">PO</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 text-right">Ordered</th>
              <th className="px-4 py-3 text-right">Received</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3 text-right">มูลค่า</th>
              <th className="px-4 py-3">กำหนดส่ง</th>
              <th className="px-4 py-3">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {pos.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มี PO</td></tr>}
            {pos.map((po) => {
              const isOpen = expandedPoId === po.poId;
              const totalOrdered = po.lines.reduce((s, l) => s + l.orderedQty, 0);
              const totalReceived = po.lines.reduce((s, l) => s + l.receivedQty, 0);
              const totalOutstanding = po.lines.reduce((s, l) => s + l.outstanding, 0);
              const totalPoValue = po.lines.reduce((s, l) => s + l.orderedQty * l.unitPrice, 0);
              const progress = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;
              return (
                <React.Fragment key={po.poId}>
                  <tr className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/60" onClick={() => setExpandedPoId(isOpen ? null : po.poId)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                        {po.poNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{suppliers[po.supplierId]?.name}</td>
                    <td className="px-4 py-3 text-right tabular">{fmt(totalOrdered)}</td>
                    <td className="px-4 py-3 text-right tabular">{fmt(totalReceived)}</td>
                    <td className="px-4 py-3 text-right tabular font-medium text-slate-900">{fmt(totalOutstanding)}</td>
                    <td className="px-4 py-3 text-right tabular">{fmtBaht(totalPoValue)}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-600">{po.expectedDeliveryDate}</div>
                      {po.isOverdue && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-red-600">
                          <AlertTriangle size={11} /> ล่าช้า {po.delayDays} วัน
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_COLOR[po.status]}`}>
                        {po.status === 'RECEIVED' && <CheckCircle2 size={12} />}
                        {po.isOverdue && po.status !== 'RECEIVED' ? 'Overdue' : STATUS_LABEL[po.status]}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50/40">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${progress >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, progress)}%` }} />
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-slate-400">
                                <th className="pb-2">Material</th>
                                <th className="pb-2 text-right">Ordered</th>
                                <th className="pb-2 text-right">Received</th>
                                <th className="pb-2 text-right">Outstanding</th>
                                <th className="pb-2">สถานะ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {po.lines.map((l, i) => (
                                <tr key={i} className="border-t border-slate-100">
                                  <td className="py-2 font-medium text-slate-700">{materials[l.materialId]?.name}</td>
                                  <td className="py-2 text-right tabular">{fmt(l.orderedQty)}</td>
                                  <td className="py-2 text-right tabular">{fmt(l.receivedQty)}</td>
                                  <td className="py-2 text-right tabular font-medium">{fmt(l.outstanding)}</td>
                                  <td className="py-2 text-slate-500">{l.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
