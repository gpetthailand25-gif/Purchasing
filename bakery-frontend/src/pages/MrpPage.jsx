import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Calculator, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { fmt, fmtBaht, KpiCard, StatusBadge, TypeTag, LoadingState, ErrorState } from '../components/ui.jsx';
import { PageHeader } from './ForecastPage.jsx';

export default function MrpPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [products, setProducts] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [mrpResult, setMrpResult] = useState(null);
  const [calculatedAt, setCalculatedAt] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [actualPurchase, setActualPurchase] = useState({});

  const loadMasterData = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api.getProducts(), api.getMaterials()]);
      setProducts(p); setMaterials(m);
    } catch (e) { setError(e); }
  }, []);

  useEffect(() => { loadMasterData(); }, [loadMasterData]);

  function nameOf(type, id) {
    return type === 'SEMI_FINISHED' ? products?.[id]?.name || id : materials?.[id]?.name || id;
  }

  async function runMRP() {
    setError(null);
    setMrpResult(null);
    try {
      const asOfDate = `${year}-${String(month).padStart(2, '0')}-15`;
      const result = await api.calculateMrp(year, month, asOfDate);
      setMrpResult(result);
      setCalculatedAt(new Date());
    } catch (e) {
      setError(e);
    }
  }

  const kpis = useMemo(() => {
    if (!mrpResult) return null;
    const all = [...mrpResult.base, ...mrpResult.incremental];
    const toOrder = all.filter((r) => r.netRequirement > 0);
    const value = toOrder.reduce((s, r) => s + r.requirementValue, 0);
    const risky = toOrder.filter((r) => {
      const actual = actualPurchase[r.type + r.id];
      return actual !== undefined && actual !== '' && Number(actual) < r.netRequirement;
    });
    return { count: toOrder.length, value, risky: risky.length };
  }, [mrpResult, actualPurchase]);

  if (!products || !materials) return error ? <ErrorState error={error} onRetry={loadMasterData} /> : <LoadingState />;

  return (
    <div>
      <PageHeader title="MRP / รายการที่ต้องสั่งซื้อ" year={year} month={month} onYear={setYear} onMonth={setMonth} />

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {calculatedAt ? `คำนวณล่าสุด ${calculatedAt.toLocaleTimeString('th-TH')}` : 'กด "คำนวณ MRP" เพื่อ Explode BOM จาก Forecast ของเดือนนี้'}
        </p>
        <button onClick={runMRP} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-amber-700">
          <Calculator size={16} /> คำนวณ MRP
        </button>
      </div>

      {error && <div className="mt-4"><ErrorState error={error} onRetry={runMRP} /></div>}

      {kpis && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="รายการที่ต้องสั่ง/ผลิต" value={kpis.count} suffix="รายการ" />
          <KpiCard label="มูลค่าที่ต้องสั่งเพิ่ม" value={fmtBaht(kpis.value)} />
          <KpiCard label="สั่งจริงน้อยกว่า Net Requirement" value={kpis.risky} suffix="รายการ" tone={kpis.risky > 0 ? 'critical' : 'ok'} />
        </div>
      )}

      {mrpResult && (
        <>
          <MrpTable title="MRP หลัก (จาก Forecast ประจำเดือน)" rows={mrpResult.base} nameOf={nameOf}
            expanded={expanded} setExpanded={setExpanded} actualPurchase={actualPurchase} setActualPurchase={setActualPurchase} />
          {mrpResult.incremental.length > 0 && (
            <MrpTable title="MRP ส่วนเพิ่มระหว่างเดือน (Adjustment — แยกจากยอดหลัก ไม่ปนกัน)" rows={mrpResult.incremental} nameOf={nameOf}
              expanded={expanded} setExpanded={setExpanded} actualPurchase={actualPurchase} setActualPurchase={setActualPurchase} keyPrefix="inc-" />
          )}
        </>
      )}
    </div>
  );
}

function MrpTable({ title, rows, nameOf, expanded, setExpanded, actualPurchase, setActualPurchase, keyPrefix = '' }) {
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3 text-right">Gross</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Open PO</th>
              <th className="px-4 py-3 text-right">Safety Stock</th>
              <th className="px-4 py-3 text-right">Net Requirement</th>
              <th className="px-4 py-3 text-right">สั่งจริง</th>
              <th className="px-4 py-3">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowKey = keyPrefix + r.type + r.id;
              const isOpen = expanded === rowKey;
              const actual = actualPurchase[rowKey];
              const short = actual !== undefined && actual !== '' && Number(actual) < r.netRequirement;
              return (
                <React.Fragment key={rowKey}>
                  <tr className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/60" onClick={() => setExpanded(isOpen ? null : rowKey)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                        <div>
                          <div className="font-medium text-slate-800">{nameOf(r.type, r.id)}</div>
                          <TypeTag type={r.type} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular">{fmt(r.grossRequirement)} {r.unit}</td>
                    <td className="px-4 py-3 text-right tabular text-slate-500">{fmt(r.currentStock)}</td>
                    <td className="px-4 py-3 text-right tabular text-slate-500">{fmt(r.openQty)}</td>
                    <td className="px-4 py-3 text-right tabular text-slate-500">{fmt(r.safetyStock)}</td>
                    <td className="px-4 py-3 text-right tabular font-semibold text-slate-900">{fmt(r.netRequirement)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        value={actual ?? ''}
                        onChange={(e) => setActualPurchase((prev) => ({ ...prev, [rowKey]: e.target.value }))}
                        placeholder={r.netRequirement > 0 ? String(r.netRequirement) : '0'}
                        className={`w-24 rounded-lg border px-2 py-1 text-right text-sm tabular outline-none ${short ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'}`}
                      />
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50/40">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">ที่มาของ Requirement (Drill Down)</p>
                          <ul className="space-y-1 text-xs text-slate-600">
                            {r.breakdown.map((b, i) => (
                              <li key={i} className="flex justify-between border-b border-dashed border-slate-100 py-1 tabular last:border-0">
                                <span>{b.source.path.map((p) => nameOf('SEMI_FINISHED', p)).join(' → ')}</span>
                                <span className="font-medium">{fmt(b.qty)} {r.unit}</span>
                              </li>
                            ))}
                          </ul>
                          {r.purchaseQtyNeeded > 0 && (
                            <p className="mt-2 text-xs text-slate-500">
                              ต้องสั่งซื้อ ≈ <span className="font-semibold text-slate-800">{r.purchaseQtyNeeded}</span> หน่วยซื้อ
                            </p>
                          )}
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
