import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          setUser(await api.me());
        } catch {
          setToken(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  // ถ้า request ไหนก็ตามโดน 401 (Token หมดอายุ/ไม่ถูกต้อง) ให้ Logout ทันทีเพื่อกลับไปหน้า Login
  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
    }
    window.addEventListener('bakery:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('bakery:unauthorized', handleUnauthorized);
  }, []);

  const login = useCallback(async (username, password) => {
    const { token, user: loggedInUser } = await api.login(username, password);
    setToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth ต้องใช้ภายใน <AuthProvider>');
  return ctx;
}
