import React, { useEffect, useState, useCallback } from 'react';
import { Plus, History, PackagePlus } from 'lucide-react';
import { api } from '../lib/api';
import { fmt, LoadingState, ErrorState } from '../components/ui.jsx';

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export default function ForecastPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [products, setProducts] = useState(null);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formProduct, setFormProduct] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formNote, setFormNote] = useState('');

  const [adjOpenFor, setAdjOpenFor] = useState(null);
  const [adjQty, setAdjQty] = useState('');
  const [adjChannel, setAdjChannel] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [productList, forecastList] = await Promise.all([api.getProducts(), api.listForecast(year, month)]);
      setProducts(productList);
      setEntries(forecastList);
    } catch (e) {
      setError(e);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (products && !formProduct) {
      const first = Object.entries(products).find(([, p]) => p.type === 'FINISHED');
      if (first) setFormProduct(first[0]);
    }
  }, [products, formProduct]);

  async function submitForecast() {
    const qty = Number(formQty);
    if (!qty || qty <= 0) return;
    await api.upsertForecast({ year, month, productId: formProduct, quantity: qty, note: formNote, enteredBy: 'buyer1' });
    setFormQty(''); setFormNote(''); setFormOpen(false);
    load();
  }

  async function submitAdjustment(productId) {
    const qty = Number(adjQty);
    if (!qty || qty <= 0) return;
    await api.addAdjustment({ year, month, productId, additionalQty: qty, customerChannel: adjChannel, enteredBy: 'buyer1' });
    setAdjQty(''); setAdjChannel(''); setAdjOpenFor(null);
    load();
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!products || !entries) return <LoadingState />;

  const finishedProducts = Object.entries(products).filter(([, p]) => p.type === 'FINISHED');

  return (
    <div>
      <PageHeader
        title="Forecast ประจำเดือน" year={year} month={month}
        onYear={(y) => { setYear(y); }} onMonth={(m) => { setMonth(m); }}
      />

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-slate-500">ระบบเก็บ Version ทุกครั้งที่แก้ไข Forecast ไม่ทับของเดิม</p>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          <Plus size={16} /> เพิ่ม / แก้ไข Forecast
        </button>
      </div>

      {formOpen && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Product</label>
              <select value={formProduct} onChange={(e) => setFormProduct(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
                {finishedProducts.map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Forecast Quantity</label>
              <input type="number" value={formQty} onChange={(e) => setFormQty(e.target.value)} placeholder="เช่น 10000" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">หมายเหตุ</label>
              <input value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="ไม่บังคับ" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setFormOpen(false)} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">ยกเลิก</button>
            <button onClick={submitForecast} className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700">บันทึก Forecast</button>
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Product</th>
              <th className="px-5 py-3 text-right">Forecast ปัจจุบัน</th>
              <th className="px-5 py-3 text-right">เดิม</th>
              <th className="px-5 py-3 text-right">เพิ่มระหว่างเดือน</th>
              <th className="px-5 py-3">Version</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">ยังไม่มี Forecast ของเดือนนี้</td></tr>
            )}
            {entries.map((entry) => {
              const revisions = entry.revisions;
              const cur = revisions[revisions.length - 1].quantity;
              const prev = revisions.length > 1 ? revisions[revisions.length - 2].quantity : null;
              const adjTotal = entry.adjustments.reduce((s, a) => s + a.additionalQty, 0);
              return (
                <React.Fragment key={entry.productId}>
                  <tr className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-4 font-medium text-slate-800">{products[entry.productId]?.name}</td>
                    <td className="px-5 py-4 text-right tabular font-medium">{fmt(cur)}</td>
                    <td className="px-5 py-4 text-right tabular text-slate-400">{prev !== null ? fmt(prev) : '—'}</td>
                    <td className="px-5 py-4 text-right tabular text-emerald-600">{adjTotal > 0 ? `+${fmt(adjTotal)}` : '—'}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        <History size={11} /> v{revisions.length}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => setAdjOpenFor(adjOpenFor === entry.productId ? null : entry.productId)} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800">
                        <PackagePlus size={13} /> เพิ่มระหว่างเดือน
                      </button>
                    </td>
                  </tr>
                  {adjOpenFor === entry.productId && (
                    <tr className="bg-amber-50/40">
                      <td colSpan={6} className="px-5 py-4">
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="text-xs font-medium text-slate-500">จำนวน Order เพิ่ม</label>
                            <input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} className="mt-1 block w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-500">ลูกค้า / ช่องทาง</label>
                            <input value={adjChannel} onChange={(e) => setAdjChannel(e.target.value)} placeholder="เช่น Modern Trade" className="mt-1 block w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
                          </div>
                          <button onClick={() => submitAdjustment(entry.productId)} className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-700">บันทึก</button>
                          <button onClick={() => setAdjOpenFor(null)} className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100">ยกเลิก</button>
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

export function PageHeader({ title, year, month, onYear, onMonth }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Bakery Purchasing</p>
        <h1 className="font-display mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
      </div>
      {onMonth && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
          <select value={month} onChange={(e) => onMonth(Number(e.target.value))} className="bg-transparent text-sm font-medium text-slate-700 outline-none">
            {THAI_MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <span className="text-slate-300">/</span>
          <select value={year} onChange={(e) => onYear(Number(e.target.value))} className="bg-transparent text-sm font-medium text-slate-700 outline-none">
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
