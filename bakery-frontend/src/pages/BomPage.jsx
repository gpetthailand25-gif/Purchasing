import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, ChevronDown, ChevronRight, Search, GitBranch, AlertTriangle, ArrowRight, Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { fmt, TypeTag, LoadingState, ErrorState } from '../components/ui.jsx';

const TODAY = new Date().toISOString().slice(0, 10);

export default function BomPage() {
  const [products, setProducts] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [error, setError] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [tab, setTab] = useState('master');
  const [search, setSearch] = useState('');

  const loadMasterData = useCallback(async () => {
    setError(null);
    try {
      const [p, m] = await Promise.all([api.getProducts(), api.getMaterials()]);
      setProducts(p); setMaterials(m);
      if (!selectedProduct) {
        const firstFinished = Object.entries(p).find(([, x]) => x.type === 'FINISHED');
        if (firstFinished) setSelectedProduct(firstFinished[0]);
      }
    } catch (e) { setError(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadMasterData(); }, [loadMasterData]);

  if (error) return <ErrorState error={error} onRetry={loadMasterData} />;
  if (!products || !materials || !selectedProduct) return <LoadingState />;

  const filtered = Object.entries(products).filter(([, p]) => search === '' || p.name.includes(search));

  return (
    <div>
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Bakery Purchasing · BOM</p>
      <h1 className="font-display mt-1 text-2xl font-semibold text-slate-900">BOM Master / Tree / Where Used</h1>

      <div className="mt-6 flex gap-6">
        <aside className="w-64 shrink-0">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา Product..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
          </div>

          <p className="mb-1.5 mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Finished Product</p>
          <ul className="space-y-0.5">
            {filtered.filter(([, p]) => p.type === 'FINISHED').map(([id, p]) => (
              <ProductItem key={id} name={p.name} active={selectedProduct === id} onClick={() => setSelectedProduct(id)} />
            ))}
          </ul>

          <p className="mb-1.5 mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Semi-Finished</p>
          <ul className="space-y-0.5">
            {filtered.filter(([, p]) => p.type === 'SEMI_FINISHED').map(([id, p]) => (
              <ProductItem key={id} name={p.name} active={selectedProduct === id} onClick={() => setSelectedProduct(id)} />
            ))}
          </ul>
        </aside>

        <main className="min-w-0 flex-1">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-900">{products[selectedProduct].name}</h2>
            <p className="text-xs text-slate-400">{selectedProduct} · {products[selectedProduct].type === 'FINISHED' ? 'Finished' : 'กึ่งสำเร็จรูป'}</p>
          </div>

          <nav className="mt-4 flex gap-6 border-b border-slate-200 text-sm">
            {[['master', 'BOM Master'], ['tree', 'BOM Tree'], ['whereused', 'Where Used']].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`relative pb-3 font-medium transition-colors ${tab === key ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                {label}
                {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-amber-600" />}
              </button>
            ))}
          </nav>

          <div className="mt-5">
            {tab === 'master' && <BomMaster productId={selectedProduct} products={products} materials={materials} />}
            {tab === 'tree' && <BomTree productId={selectedProduct} products={products} />}
            {tab === 'whereused' && (
              <WhereUsed productId={selectedProduct} productType={products[selectedProduct].type} products={products}
                jumpTo={(pid) => { setSelectedProduct(pid); setTab('master'); }} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ProductItem({ name, active, onClick }) {
  return (
    <li>
      <button onClick={onClick} className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${active ? 'bg-amber-600 text-white font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
        <span className="truncate">{name}</span>
      </button>
    </li>
  );
}

/* ------------------------------ BOM Master ------------------------------ */

function BomMaster({ productId, products, materials }) {
  const [tree, setTree] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('RAW_MATERIAL');
  const [newId, setNewId] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newLoss, setNewLoss] = useState('0');
  const [newYield, setNewYield] = useState('100');
  const [submitError, setSubmitError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const t = await api.getBomTree(productId, TODAY);
      setTree(t);
    } catch (e) { setError(e); }
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  const componentOptions = useMemo(() => {
    if (newType === 'SEMI_FINISHED') return Object.entries(products).filter(([id, p]) => p.type === 'SEMI_FINISHED' && id !== productId);
    return Object.entries(materials);
  }, [newType, products, materials, productId]);

  async function submit() {
    if (!newId || !newQty) return;
    const unit = newType === 'SEMI_FINISHED' ? 'ชิ้น' : 'kg';
    setSubmitError(null);
    try {
      await api.addBomDetail(productId, {
        componentType: newType, componentId: newId, quantity: Number(newQty), unit,
        lossPct: Number(newLoss), yieldPct: Number(newYield),
      }, TODAY);
      setNewId(''); setNewQty(''); setNewLoss('0'); setNewYield('100'); setAdding(false);
      load();
    } catch (e) {
      setSubmitError(e.message);
    }
  }

  async function removeComponent(bomDetailId) {
    setError(null);
    try {
      await api.removeBomDetail(productId, bomDetailId);
      load();
    } catch (e) {
      setError(e);
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!tree && !error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">
        ยังไม่มี BOM สำหรับ Product นี้ — เพิ่ม Component แรกด้านล่าง
        <AddComponentForm {...{ adding: true, setAdding, newType, setNewType, newId, setNewId, newQty, setNewQty, newLoss, setNewLoss, newYield, setNewYield, submit, submitError, componentOptions, productId }} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{tree.version}</span>
        <span className="text-xs text-slate-400">ณ {TODAY}</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Component</th>
              <th className="px-4 py-3 text-right">Quantity</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3 text-right">Loss %</th>
              <th className="px-4 py-3 text-right">Yield %</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {tree.components.map((c, i) => (
              <tr key={c.bomDetailId || i} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <TypeTag type={c.componentType} />
                    <span className="font-medium text-slate-800">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular">{fmt(c.quantity)}</td>
                <td className="px-4 py-3 text-slate-500">{c.unit}</td>
                <td className="px-4 py-3 text-right tabular text-slate-500">{c.lossPct}%</td>
                <td className="px-4 py-3 text-right tabular text-slate-500">{c.yieldPct}%</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => removeComponent(c.bomDetailId)} className="text-slate-300 hover:text-red-500" title="ลบ Component">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {tree.components.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">ยังไม่มี Component</td></tr>
            )}
          </tbody>
        </table>

        <div className="border-t border-slate-100 p-4">
          <AddComponentForm {...{ adding, setAdding, newType, setNewType, newId, setNewId, newQty, setNewQty, newLoss, setNewLoss, newYield, setNewYield, submit, submitError, componentOptions, productId }} />
        </div>
      </div>
    </div>
  );
}

function AddComponentForm({ adding, setAdding, newType, setNewType, newId, setNewId, newQty, setNewQty, newLoss, setNewLoss, newYield, setNewYield, submit, submitError, componentOptions }) {
  if (!adding) {
    return (
      <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800">
        <Plus size={15} /> เพิ่ม Component
      </button>
    );
  }
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <label className="text-xs font-medium text-slate-500">ประเภท</label>
          <select value={newType} onChange={(e) => { setNewType(e.target.value); setNewId(''); }} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
            <option value="SEMI_FINISHED">กึ่งสำเร็จรูป</option>
            <option value="RAW_MATERIAL">วัตถุดิบ</option>
            <option value="PACKAGING">บรรจุภัณฑ์</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-500">รายการ</label>
          <select value={newId} onChange={(e) => setNewId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
            <option value="">เลือก...</option>
            {componentOptions.map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">จำนวน</label>
          <input type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500">Loss %</label>
            <input type="number" value={newLoss} onChange={(e) => setNewLoss(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500">Yield %</label>
            <input type="number" value={newYield} onChange={(e) => setNewYield(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
          </div>
        </div>
      </div>
      {submitError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {submitError}
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={() => setAdding(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">ยกเลิก</button>
        <button onClick={submit} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">เพิ่ม</button>
      </div>
    </div>
  );
}

/* -------------------------------- BOM Tree ------------------------------- */

function BomTree({ productId }) {
  const [tree, setTree] = useState(null);
  const [error, setError] = useState(null);
  const [batchQty, setBatchQty] = useState(1);
  const [collapsed, setCollapsed] = useState(new Set());

  const load = useCallback(async () => {
    setError(null);
    try { setTree(await api.getBomTree(productId, TODAY)); } catch (e) { setError(e); }
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  function toggle(key) {
    setCollapsed((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }

  function renderComponents(components, qty, path, depth) {
    return (
      <ul className={depth === 0 ? '' : 'ml-5 border-l border-dashed border-slate-200 pl-4'}>
        {components.map((c, i) => {
          const key = path + '/' + i;
          const isCollapsed = collapsed.has(key);
          const needed = qty * c.quantity / (c.yieldPct / 100) * (1 + c.lossPct / 100);
          const isSemi = c.componentType === 'SEMI_FINISHED';
          return (
            <li key={key} className="py-1">
              <div className="flex items-center gap-2">
                {isSemi ? (
                  <button onClick={() => toggle(key)} className="text-slate-400 hover:text-slate-600">
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                ) : <span className="w-3.5" />}
                <TypeTag type={c.componentType} />
                <span className="text-sm font-medium text-slate-800">{c.name}</span>
                <span className="text-sm tabular text-slate-500">{fmt(needed)} {c.unit}</span>
              </div>
              {isSemi && !isCollapsed && c.children && renderComponents(c.children.components, needed, key, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!tree) return <LoadingState />;

  return (
    <div>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <GitBranch size={15} className="text-amber-600" />
          Explode สำหรับผลิต
          <input type="number" value={batchQty} onChange={(e) => setBatchQty(Number(e.target.value) || 0)}
            className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
          ชิ้น
        </div>
        <button onClick={() => setCollapsed(new Set())} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50">Expand All</button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 pb-2">
          <span className="font-display text-base font-semibold text-slate-900">{tree.productName}</span>
          <span className="text-sm tabular text-slate-400">× {fmt(batchQty)}</span>
        </div>
        {renderComponents(tree.components, batchQty, 'root', 0)}
      </div>
    </div>
  );
}

/* ------------------------------- Where Used ------------------------------ */

function WhereUsed({ productId, productType, products, jumpTo }) {
  const [usedIn, setUsedIn] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (productType !== 'SEMI_FINISHED') { setUsedIn([]); return; }
    setError(null);
    api.whereUsed('SEMI_FINISHED', productId).then(setUsedIn).catch(setError);
  }, [productId, productType]);

  if (error) return <ErrorState error={error} />;
  if (usedIn === null) return <LoadingState />;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">
        <span className="font-medium text-slate-800">{products[productId].name}</span> ถูกใช้เป็น Component ใน:
      </p>
      {productType !== 'SEMI_FINISHED' ? (
        <p className="mt-3 text-sm text-slate-400">Finished Product ไม่ถูกใช้เป็น Component ของสินค้าอื่น</p>
      ) : usedIn.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">ไม่พบการใช้งาน</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {usedIn.map((w) => (
            <li key={w.productId}>
              <button onClick={() => jumpTo(w.productId)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left text-sm hover:border-amber-300 hover:bg-amber-50/40">
                <span className="font-medium text-slate-800">{w.productName}</span>
                <span className="flex items-center gap-1 text-xs font-medium text-amber-700">ดู BOM <ArrowRight size={13} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
