import React from 'react';
import { CheckCircle2, AlertTriangle, Wheat, Package, Layers } from 'lucide-react';

export function fmt(n) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 3 }).format(n);
}
export function fmtBaht(n) {
  return '฿' + new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(n);
}
export function fmtCompact(n) {
  return new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function StatusBadge({ status }) {
  const isOk = /พอสั่ง|พอผลิต|เพียงพอ|Received|ครบแล้ว/.test(status);
  const cls = isOk
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
    : 'bg-amber-50 text-amber-700 ring-amber-600/20';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {isOk ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
      {status}
    </span>
  );
}

export const TYPE_LABEL = { SEMI_FINISHED: 'กึ่งสำเร็จรูป', RAW_MATERIAL: 'วัตถุดิบ', PACKAGING: 'บรรจุภัณฑ์' };
const TYPE_COLOR = {
  SEMI_FINISHED: 'text-amber-700 bg-amber-50 ring-amber-600/20',
  RAW_MATERIAL: 'text-slate-600 bg-slate-100 ring-slate-500/10',
  PACKAGING: 'text-sky-700 bg-sky-50 ring-sky-600/20',
};
const TYPE_ICON = { SEMI_FINISHED: Layers, RAW_MATERIAL: Wheat, PACKAGING: Package };

export function TypeTag({ type }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TYPE_COLOR[type]}`}>
      <Icon size={11} /> {TYPE_LABEL[type]}
    </span>
  );
}

export function KpiCard({ label, value, suffix, tone }) {
  const toneCls = tone === 'critical' ? 'text-red-600' : tone === 'ok' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`font-display mt-1 text-2xl font-semibold tabular ${toneCls}`}>
        {value} {suffix && <span className="text-sm font-normal text-slate-400">{suffix}</span>}
      </p>
    </div>
  );
}

export function LoadingState({ label = 'กำลังโหลด...' }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">{label}</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-red-700">
        <AlertTriangle size={15} /> {error?.message || 'เกิดข้อผิดพลาด'}
      </p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">
          ลองใหม่
        </button>
      )}
    </div>
  );
}
