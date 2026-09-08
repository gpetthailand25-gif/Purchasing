import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const DEMO_ACCOUNTS = [
  { role: 'Admin', username: 'admin', password: 'admin123' },
  { role: 'ฝ่ายจัดซื้อ (Purchasing)', username: 'buyer1', password: 'buyer123' },
  { role: 'คลังสินค้า (Warehouse)', username: 'wh1', password: 'wh123' },
  { role: 'ผู้บริหาร (Management)', username: 'mgr1', password: 'mgr123' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || '/dashboard';

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(acc) {
    setUsername(acc.username);
    setPassword(acc.password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 font-sans">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Bakery</p>
          <h1 className="font-display mt-1 text-2xl font-semibold text-slate-900">Purchasing · MRP · BOM</h1>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="text-xs font-medium text-slate-500">Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-slate-500">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
          </div>

          {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

          <button type="submit" disabled={loading}
            className="mt-5 w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Demo Accounts (คลิกเพื่อกรอกอัตโนมัติ)</p>
          <ul className="space-y-1">
            {DEMO_ACCOUNTS.map((acc) => (
              <li key={acc.username}>
                <button type="button" onClick={() => fillDemo(acc)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50">
                  <span>{acc.role}</span>
                  <span className="tabular text-slate-400">{acc.username} / {acc.password}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
