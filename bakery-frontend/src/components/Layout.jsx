import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Calculator, Layers, Truck, PackageCheck, LogOut,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';

// roles: undefined = ทุก Role ที่ Login แล้วเห็นได้ / array = เฉพาะ Role ที่ระบุ (ADMIN เห็นเสมอ)
// อิงตาม RBAC matrix เดียวกับฝั่ง Backend (src/api/routes.js) เพื่อไม่ให้เมนูโชว์ทางที่กดแล้วเจอ 403
const NAV_GROUPS = [
  {
    label: 'Dashboard',
    items: [['/dashboard', 'Dashboard', LayoutDashboard, ['PURCHASING', 'MANAGEMENT']]],
  },
  {
    label: 'Planning',
    items: [
      ['/forecast', 'Forecast ประจำเดือน', ClipboardList, ['PURCHASING', 'MANAGEMENT']],
      ['/mrp', 'MRP', Calculator, ['PURCHASING', 'MANAGEMENT']],
    ],
  },
  {
    label: 'BOM',
    items: [['/bom', 'BOM Master / Tree', Layers, ['PURCHASING', 'MANAGEMENT']]],
  },
  {
    label: 'Purchasing',
    items: [
      ['/po', 'PO Tracking', Truck, ['PURCHASING', 'WAREHOUSE', 'MANAGEMENT']],
      ['/receiving', 'รับสินค้า (Receiving)', PackageCheck, ['WAREHOUSE']],
    ],
  },
];

const ROLE_LABEL = {
  ADMIN: 'ผู้ดูแลระบบ', PURCHASING: 'ฝ่ายจัดซื้อ', WAREHOUSE: 'คลังสินค้า', MANAGEMENT: 'ผู้บริหาร',
};

function canSee(roles, userRole) {
  if (!roles) return true;
  return userRole === 'ADMIN' || roles.includes(userRole);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="flex">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
          <div className="px-2">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Bakery</p>
            <p className="font-display text-lg font-semibold text-slate-900">Purchasing · MRP</p>
          </div>

          <nav className="mt-6 flex-1 space-y-5">
            {NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter(([, , , roles]) => canSee(roles, user?.role));
              if (visibleItems.length === 0) return null;
              return (
                <div key={group.label}>
                  <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
                  <ul className="space-y-0.5">
                    {visibleItems.map(([to, label, Icon]) => (
                      <li key={to}>
                        <NavLink
                          to={to}
                          className={({ isActive }) =>
                            `flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                              isActive ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                            }`
                          }
                        >
                          <Icon size={16} /> {label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>

          {user && (
            <div className="border-t border-slate-100 pt-3">
              <div className="px-2">
                <p className="truncate text-sm font-medium text-slate-800">{user.fullName}</p>
                <p className="text-xs text-slate-400">{ROLE_LABEL[user.role] || user.role}</p>
              </div>
              <button onClick={handleLogout} className="mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
                <LogOut size={15} /> ออกจากระบบ
              </button>
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
