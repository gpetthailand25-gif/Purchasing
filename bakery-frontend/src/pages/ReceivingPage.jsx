import React, { useEffect, useState, useCallback } from 'react';
import { PackageCheck, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { fmt, LoadingState, ErrorState } from '../components/ui.jsx';

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

export default function ReceivingPage() {
  const [pos, setPos] = useState(null);
  const [suppliers, setSuppliers] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [amounts, setAmounts] = useState({});
  const today = new Date();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [poList, supplierList, materialList] = await Promise.all([api.listPurchaseOrders(), api.getSuppliers(), api.getMaterials()]);
      setPos(poList); setSuppliers(supplierList); setMaterials(materialList);
      if (selectedId === null) {
        const first = poList.find((p) => p.status !== 'RECEIVED' && p.status !== 'CANCELLED' && p.status !== 'DRAFT');
        if (first) setSelectedId(first.poId);
      }
    } catch (e) { setError(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    const po = pos.find((p) => p.poId === selectedId);
    if (!po) return;
    const nonZero = Object.fromEntries(Object.entries(amounts).filter(([, v]) => Number(v) > 0));
    if (Object.keys(nonZero).length === 0) return;
    const lines = Object.entries(nonZero).map(([materialId, receivedQty]) => ({ materialId, receivedQty: Number(receivedQty) }));
    await api.receiveGoods(po.poId, lines);
    setAmounts({});
    load();
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!pos || !suppliers || !materials) return <LoadingState />;

  const receivable = pos.filter((p) => p.status !== 'RECEIVED' && p.status !== 'CANCELLED' && p.status !== 'DRAFT');
  const po = pos.find((p) => p.poId === selectedId);

  return (
    <div>
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Bakery Purchasing</p>
      <h1 className="font-display mt-1 text-2xl font-semibold text-slate-900">รับสินค้า (Receiving)</h1>

      {receivable.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">ไม่มี PO ที่รอรับสินค้าในขณะนี้</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">เลือก PO</p>
            <ul className="space-y-1.5">
              {receivable.map((p) => (
                <li key={p.poId}>
                  <button onClick={() => { setSelectedId(p.poId); setAmounts({}); }}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${selectedId === p.poId ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{p.poNumber}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_COLOR[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">{suppliers[p.supplierId]?.name}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            {po && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display text-lg font-semibold text-slate-900">{po.poNumber}</p>
                    <p className="text-xs text-slate-400">{suppliers[po.supplierId]?.name} · กำหนดส่ง {po.expectedDeliveryDate}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock size={13} /> วันนี้ {today.toISOString().slice(0, 10)}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {po.lines.map((l) => {
                    const progress = (l.receivedQty / l.orderedQty) * 100;
                    return (
                      <div key={l.materialId} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-800">{materials[l.materialId]?.name}</span>
                          <span className="tabular text-slate-500">{fmt(l.receivedQty)} / {fmt(l.orderedQty)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${progress >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, progress)}%` }} />
                        </div>
                        {l.outstanding > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <label className="text-xs text-slate-500">รับเพิ่มครั้งนี้:</label>
                            <input type="number" max={l.outstanding} value={amounts[l.materialId] ?? ''}
                              onChange={(e) => setAmounts((prev) => ({ ...prev, [l.materialId]: e.target.value }))}
                              placeholder={`สูงสุด ${fmt(l.outstanding)}`}
                              className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
                            <span className="text-xs text-slate-400">(ค้างรับ {fmt(l.outstanding)})</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button onClick={submit} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                  <PackageCheck size={16} /> บันทึกรับสินค้า
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
