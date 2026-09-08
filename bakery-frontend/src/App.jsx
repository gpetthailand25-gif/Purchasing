import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import Layout from './components/Layout.jsx';
import ForecastPage from './pages/ForecastPage.jsx';
import MrpPage from './pages/MrpPage.jsx';
import BomPage from './pages/BomPage.jsx';
import PoTrackingPage from './pages/PoTrackingPage.jsx';
import CreatePoPage from './pages/CreatePoPage.jsx';
import ReceivingPage from './pages/ReceivingPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/forecast" element={<ForecastPage />} />
          <Route path="/mrp" element={<MrpPage />} />
          <Route path="/bom" element={<BomPage />} />
          <Route path="/po" element={<PoTrackingPage />} />
          <Route path="/po/new" element={<CreatePoPage />} />
          <Route path="/receiving" element={<ReceivingPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
