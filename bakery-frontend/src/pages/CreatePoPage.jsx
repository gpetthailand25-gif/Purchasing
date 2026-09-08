import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Truck } from 'lucide-react';
import { api } from '../lib/api';
import { fmtBaht, LoadingState, ErrorState } from '../components/ui.jsx';

export default function CreatePoPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [error, setError] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const [supplierId, setSupplierId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [lines, setLines] = useState([{ materialId: '', orderedQty: '', unitPrice: '' }]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, m] = await Promise.all([api.getSuppliers(), api.getMaterials()]);
      setSuppliers(s); setMaterials(m);
      setSupplierId(Object.keys(s)[0]);
      const firstMaterial = Object.keys(m)[0];
      setLines([{ materialId: firstMaterial, orderedQty: '', unitPrice: m[firstMaterial].price }]);
    } catch (e) { setError(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateLine(i, patch) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    const firstMaterial = Object.keys(materials)[0];
    setLines((prev) => [...prev, { materialId: firstMaterial, orderedQty: '', unitPrice: materials[firstMaterial].price }]);
  }
  function removeLine(i) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!suppliers || !materials) return <LoadingState />;

  const total = lines.reduce((s, l) => s + (Number(l.orderedQty) || 0) * (Number(l.unitPrice) || 0), 0);
  const canSubmit = expectedDeliveryDate && lines.every((l) => Number(l.orderedQty) > 0);

  async function submit() {
    if (!canSubmit) return;
    setSubmitError(null);
    try {
      await api.createPurchaseOrder({
        supplierId, expectedDeliveryDate,
        lines: lines.map((l) => ({ materialId: l.materialId, orderedQty: Number(l.orderedQty), unitPrice: Number(l.unitPrice) })),
      });
      navigate('/po');
    } catch (e) {
      setSubmitError(e.message);
    }
  }

  return (
    <div>
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Bakery Purchasing</p>
      <h1 className="font-display mt-1 text-2xl font-semibold text-slate-900">สร้าง Purchase Order</h1>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500">Supplier</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
              {Object.entries(suppliers).map(([id, s]) => <option key={id} value={id}>{s.name} (Lead Time {s.leadTimeDays} วัน)</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Expected Delivery Date</label>
            <input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">รายการวัตถุดิบ</p>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2.5">
                <select value={l.materialId} onChange={(e) => updateLine(i, { materialId: e.target.value, unitPrice: materials[e.target.value].price })}
                  className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
                  {Object.entries(materials).map(([id, m]) => <option key={id} value={id}>{m.name}</option>)}
                </select>
                <input type="number" placeholder="จำนวน" value={l.orderedQty} onChange={(e) => updateLine(i, { orderedQty: e.target.value })}
                  className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
                <span className="text-slate-300">×</span>
                <input type="number" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
                <span className="ml-auto text-sm tabular font-medium text-slate-700">{fmtBaht((Number(l.orderedQty) || 0) * (Number(l.unitPrice) || 0))}</span>
                {lines.length > 1 && <button onClick={() => removeLine(i)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
          <button onClick={addLine} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800">
            <Plus size={14} /> เพิ่มรายการ
          </button>
        </div>

        {submitError && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{submitError}</div>}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-sm text-slate-500">
            มูลค่ารวม <span className="font-display ml-1 text-lg font-semibold tabular text-slate-900">{fmtBaht(total)}</span>
          </div>
          <button onClick={submit} disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            <Truck size={16} /> สร้าง PO
          </button>
        </div>
      </div>
    </div>
  );
}
