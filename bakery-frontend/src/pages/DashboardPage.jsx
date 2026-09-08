import React, { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { AlertTriangle, TrendingUp, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api';
import { fmtBaht, fmtCompact, LoadingState, ErrorState } from '../components/ui.jsx';

const LEVEL_STYLE = {
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  critical: 'bg-red-50 text-red-700 ring-red-600/20',
};

const AMBER = '#B45309';
const SLATE = '#64748B';

/* --------------------------------- App ----------------------------------- */

export default function DashboardPage() {
  const [tab, setTab] = useState('purchasing');

  return (
    <div>
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Bakery Purchasing · Dashboard</p>
      <h1 className="font-display mt-1 text-2xl font-semibold text-slate-900">Dashboard</h1>

      <nav className="mt-5 flex gap-6 border-b border-slate-200 text-sm">
        {[
          ['purchasing', 'Purchasing Dashboard'],
          ['executive', 'Executive Dashboard'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative pb-3 font-medium transition-colors ${tab === key ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {label}
            {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-amber-600" />}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'purchasing' ? <PurchasingDashboard /> : <ExecutiveDashboard />}
      </div>
    </div>
  );
}

/* --------------------------- Purchasing Dashboard -------------------------- */

function PurchasingDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.getDashboardPurchasing());
    } catch (e) { setError(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <LoadingState />;

  const { kpis, actionRequired, materialsBelowSafety } = data;

  const kpiTiles = [
    { label: 'รายการที่ต้องสั่ง', value: kpis.itemsToOrder, suffix: 'รายการ' },
    { label: 'มูลค่าที่ต้องสั่ง', value: fmtBaht(kpis.valueToOrder) },
    { label: 'PO เปิดแล้ว', value: kpis.openPoCount, suffix: 'ใบ' },
    { label: 'Open PO Value', value: fmtBaht(kpis.openPoValue) },
    { label: 'Received Value', value: fmtBaht(kpis.receivedValue) },
    { label: 'Outstanding Value', value: fmtBaht(kpis.outstandingValue) },
    { label: 'Overdue Value', value: fmtBaht(kpis.overdueValue), tone: kpis.overdueValue > 0 ? 'critical' : undefined },
    { label: 'ต่ำกว่า Safety Stock', value: kpis.belowSafetyStockCount, suffix: 'รายการ', tone: kpis.belowSafetyStockCount > 0 ? 'critical' : undefined },
  ];

  const actionTiles = [
    { key: 'openPo', label: 'ต้องเปิด PO', count: actionRequired.openPo, level: actionRequired.openPo > 0 ? 'warning' : 'info' },
    { key: 'pendingApproval', label: 'PO รออนุมัติ', count: actionRequired.pendingApproval, level: 'info' },
    { key: 'pendingSend', label: 'PO รอส่ง Supplier', count: actionRequired.pendingSendToSupplier, level: 'info' },
    { key: 'dueSoon', label: 'PO ใกล้ครบกำหนด (3 วัน)', count: actionRequired.dueSoon, level: actionRequired.dueSoon > 0 ? 'warning' : 'info' },
    { key: 'overdue', label: 'PO Overdue', count: actionRequired.overduePo, level: actionRequired.overduePo > 0 ? 'critical' : 'info' },
    { key: 'risk', label: 'Material เสี่ยงขาด', count: actionRequired.materialAtRisk, level: actionRequired.materialAtRisk > 0 ? 'critical' : 'info' },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpiTiles.map((k) => <KpiTile key={k.label} {...k} />)}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-700">Action Required</h3>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {actionTiles.map((a) => (
            <div key={a.key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
              <span className="text-sm font-medium text-slate-700">{a.label}</span>
              <span className={`font-display rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ring-inset ${LEVEL_STYLE[a.level]}`}>{a.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-700">Material เสี่ยงขาด (ต่ำกว่า Safety Stock)</h3>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Safety Stock</th>
                <th className="px-4 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {materialsBelowSafety.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">ไม่มี Material ต่ำกว่า Safety Stock ในขณะนี้</td></tr>
              )}
              {materialsBelowSafety.map((m) => (
                <tr key={m.materialId} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-800">{m.name}</td>
                  <td className="px-4 py-3 text-right tabular">{m.stock}</td>
                  <td className="px-4 py-3 text-right tabular text-slate-500">{m.safetyStock}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${LEVEL_STYLE[m.level]}`}>
                      <AlertTriangle size={11} /> {m.level === 'critical' ? 'Critical' : 'Warning'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Executive Dashboard --------------------------- */

function ExecutiveDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.getDashboardExecutive());
    } catch (e) { setError(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <LoadingState />;

  const { kpis, charts, priceIncreases, materialRisk } = data;

  const kpiTiles = [
    { label: 'Forecast Value', value: fmtBaht(kpis.forecastValue) },
    { label: 'Requirement Value', value: fmtBaht(kpis.requirementValue) },
    { label: 'Actual Purchase Value', value: fmtBaht(kpis.actualPurchaseValue) },
    { label: 'Open PO Value', value: fmtBaht(kpis.openPoValue) },
    { label: 'Received Value', value: fmtBaht(kpis.receivedValue) },
    { label: 'Outstanding PO Value', value: fmtBaht(kpis.outstandingPoValue) },
    { label: 'Overdue PO Value', value: fmtBaht(kpis.overduePoValue), tone: kpis.overduePoValue > 0 ? 'critical' : undefined },
  ];

  const noData = charts.monthlyPurchase.length === 0;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpiTiles.map((k) => <KpiTile key={k.label} {...k} />)}
      </div>

      {noData && (
        <p className="mt-4 text-xs text-slate-400">
          ยังไม่มีข้อมูล PO ในระบบมากพอสำหรับกราฟแนวโน้ม — กราฟจะเริ่มมีข้อมูลเมื่อสร้าง PO และผ่านไปหลายเดือน
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="มูลค่าการจัดซื้อรายเดือน">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={charts.monthlyPurchase} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
              <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => fmtBaht(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Line type="monotone" dataKey="value" stroke={AMBER} strokeWidth={2.5} dot={{ r: 3, fill: AMBER }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Forecast vs Actual Purchase">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts.forecastVsActual} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
              <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => fmtBaht(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="forecast" name="Forecast" fill={SLATE} radius={[3, 3, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill={AMBER} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Open PO ตาม Supplier">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts.openPoBySupplier} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="supplier" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={110} />
              <Tooltip formatter={(v) => fmtBaht(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Bar dataKey="value" fill={SLATE} radius={[0, 3, 3, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Outstanding PO ตาม Supplier">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts.outstandingBySupplier} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="supplier" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={110} />
              <Tooltip formatter={(v) => fmtBaht(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Bar dataKey="value" fill="#DC2626" radius={[0, 3, 3, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Top Material ตามมูลค่าซื้อ</h3>
          <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <tbody>
                {charts.topMaterials.length === 0 && (
                  <tr><td className="px-4 py-6 text-center text-sm text-slate-400">ยังไม่มี PO ในระบบ</td></tr>
                )}
                {charts.topMaterials.map((m, i) => {
                  const maxValue = charts.topMaterials[0].value || 1;
                  return (
                    <tr key={m.materialId} className="border-b border-slate-50 last:border-0">
                      <td className="w-8 px-4 py-2.5 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-800">{m.material}</span>
                          <span className="tabular text-slate-500">{fmtBaht(m.value)}</span>
                        </div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-amber-500" style={{ width: `${(m.value / maxValue) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <TrendingUp size={15} className="text-red-500" /> Price Increase Alert
            </h3>
            <div className="mt-2 space-y-2">
              {priceIncreases.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-400">ยังไม่พบราคาที่ปรับขึ้นจากการสร้าง PO</div>
              )}
              {priceIncreases.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.material}</p>
                    <p className="text-xs text-slate-400">{p.supplier} · {p.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-xs text-slate-400 line-through">฿{p.from}</p>
                    <p className="flex items-center gap-1 tabular text-sm font-semibold text-red-600">
                      ฿{p.to} <ArrowUpRight size={12} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <AlertTriangle size={15} className="text-amber-600" /> Material Risk
            </h3>
            <div className="mt-2 space-y-2">
              {materialRisk.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-400">ไม่มี Material เสี่ยงขาดในขณะนี้</div>
              )}
              {materialRisk.map((m) => (
                <div key={m.materialId} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <span className="text-sm font-medium text-slate-800">{m.material}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${LEVEL_STYLE[m.level]}`}>
                    Stock {m.stock} / SS {m.safetyStock}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Shared UI -------------------------------- */

function KpiTile({ label, value, suffix, tone }) {
  const toneCls = tone === 'critical' ? 'text-red-600' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`font-display mt-1 text-xl font-semibold tabular ${toneCls}`}>
        {value} {suffix && <span className="text-sm font-normal text-slate-400">{suffix}</span>}
      </p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}
