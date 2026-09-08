import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { fmt, fmtBaht, TypeTag, LoadingState, ErrorState } from '../components/ui.jsx';

const EMPTY_FORM = { name: '', type: 'RAW', unit: 'kg', purchaseUnit: '', conversionRate: 1, price: '', safetyStock: '' };

export default function MaterialsPage() {
  const [materials, setMaterials] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = กำลังเพิ่มใหม่, มีค่า = กำลังแก้ไข
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitError, setSubmitError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMaterials(await api.getMaterials());
    } catch (e) { setError(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!materials) return [];
    const q = search.trim().toLowerCase();
    return Object.entries(materials)
      .filter(([id, m]) => q === '' || m.name.toLowerCase().includes(q) || id.toLowerCase().includes(q))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [materials, search]);

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSubmitError(null);
    setFormOpen(true);
  }

  function openEditForm(id, m) {
    setEditingId(id);
    setForm({
      name: m.name, type: m.type, unit: m.unit, purchaseUnit: m.purchaseUnit,
      conversionRate: m.conversionRate, price: m.price, safetyStock: m.safetyStock,
    });
    setSubmitError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setSubmitError(null);
  }

  async function submit() {
    if (!form.name.trim()) { setSubmitError('กรุณากรอกชื่อ Material'); return; }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      unit: form.unit || 'kg',
      purchaseUnit: form.purchaseUnit || form.unit || 'kg',
      conversionRate: Number(form.conversionRate) || 1,
      price: Number(form.price) || 0,
      safetyStock: Number(form.safetyStock) || 0,
    };
    setSubmitError(null);
    try {
      if (editingId) await api.updateMaterial(editingId, payload);
      else await api.createMaterial(payload);
      closeForm();
      load();
    } catch (e) {
      setSubmitError(e.message);
    }
  }

  async function handleDelete(id) {
    setDeleteError(null);
    try {
      await api.deleteMaterial(id);
      load();
    } catch (e) {
      setDeleteError({ id, message: e.message });
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!materials) return <LoadingState />;

  return (
    <div>
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Bakery Purchasing · Master Data</p>
      <h1 className="font-display mt-1 text-2xl font-semibold text-slate-900">รายการวัตถุดิบ / บรรจุภัณฑ์</h1>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ Material หรือรหัส..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <button
          onClick={openAddForm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          <Plus size={16} /> เพิ่ม Material
        </button>
      </div>

      {formOpen && (
        <MaterialForm
          form={form}
          setForm={setForm}
          submit={submit}
          cancel={closeForm}
          submitError={submitError}
          isEditing={!!editingId}
        />
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">รหัส</th>
              <th className="px-4 py-3">ชื่อ</th>
              <th className="px-4 py-3">ประเภท</th>
              <th className="px-4 py-3">หน่วยใช้งาน</th>
              <th className="px-4 py-3">หน่วยซื้อ</th>
              <th className="px-4 py-3 text-right">Conversion</th>
              <th className="px-4 py-3 text-right">ราคา/หน่วย</th>
              <th className="px-4 py-3 text-right">Safety Stock</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">ไม่พบ Material ที่ค้นหา</td></tr>
            )}
            {filtered.map(([id, m]) => (
              <React.Fragment key={id}>
                <tr className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{id}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{m.name}</td>
                  <td className="px-4 py-3"><TypeTag type={m.type === 'PACKAGING' ? 'PACKAGING' : 'RAW_MATERIAL'} /></td>
                  <td className="px-4 py-3 text-slate-500">{m.unit}</td>
                  <td className="px-4 py-3 text-slate-500">{m.purchaseUnit}</td>
                  <td className="px-4 py-3 text-right tabular text-slate-500">{fmt(m.conversionRate)}</td>
                  <td className="px-4 py-3 text-right tabular">{fmtBaht(m.price)}</td>
                  <td className="px-4 py-3 text-right tabular text-slate-500">{fmt(m.safetyStock)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEditForm(id, m)} className="text-slate-400 hover:text-amber-600" title="แก้ไข">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(id)} className="text-slate-300 hover:text-red-500" title="ลบ">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                {deleteError?.id === id && (
                  <tr className="bg-red-50/60">
                    <td colSpan={9} className="px-4 py-2">
                      <div className="flex items-center gap-1.5 text-xs text-red-700">
                        <AlertTriangle size={12} /> {deleteError.message}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaterialForm({ form, setForm, submit, cancel, submitError, isEditing }) {
  function update(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-slate-700">{isEditing ? 'แก้ไข Material' : 'เพิ่ม Material ใหม่'}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-slate-500">ชื่อ Material</label>
          <input value={form.name} onChange={(e) => update({ name: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">ประเภท</label>
          <select value={form.type} onChange={(e) => update({ type: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
            <option value="RAW">วัตถุดิบ</option>
            <option value="PACKAGING">บรรจุภัณฑ์</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">หน่วยใช้งาน (เช่น kg, ชิ้น)</label>
          <input value={form.unit} onChange={(e) => update({ unit: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">หน่วยซื้อ (เช่น กระสอบ 25kg)</label>
          <input value={form.purchaseUnit} onChange={(e) => update({ purchaseUnit: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Conversion (หน่วยใช้งาน / 1 หน่วยซื้อ)</label>
          <input type="number" value={form.conversionRate} onChange={(e) => update({ conversionRate: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">ราคา / หน่วยใช้งาน (บาท)</label>
          <input type="number" value={form.price} onChange={(e) => update({ price: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Safety Stock</label>
          <input type="number" value={form.safetyStock} onChange={(e) => update({ safetyStock: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
        </div>
      </div>

      {submitError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {submitError}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={cancel} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">ยกเลิก</button>
        <button onClick={submit} className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700">
          {isEditing ? 'บันทึกการแก้ไข' : 'เพิ่ม Material'}
        </button>
      </div>
    </div>
  );
}
