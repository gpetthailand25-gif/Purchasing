// ในเครื่อง Dev: ใช้ Vite proxy '/api' -> localhost:3000 (ดู vite.config.js)
// บน Firebase Hosting: Hosting เสิร์ฟแค่ Frontend (Static File) เท่านั้น ไม่มี Backend Node
// รันอยู่ด้วย ต้อง Deploy bakery-mrp (Backend) แยกไปที่อื่น (Render/Fly.io/Cloud Run ฯลฯ)
// แล้วตั้งค่า VITE_API_BASE เป็น URL เต็มของ Backend นั้นตอน Build (ดู README)
const BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'bakery_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, body) {
  const token = getToken();
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      setToken(null); // Token หมดอายุ/ไม่ถูกต้อง -> เคลียร์ทิ้งให้กลับไป Login ใหม่
      window.dispatchEvent(new Event('bakery:unauthorized'));
    }
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  me: () => request('GET', '/auth/me'),

  // Master data
  getProducts: () => request('GET', '/products'),
  getMaterials: () => request('GET', '/materials'),
  getSuppliers: () => request('GET', '/suppliers'),

  // Forecast
  listForecast: (year, month) => request('GET', `/forecast?year=${year}&month=${month}`),
  upsertForecast: (payload) => request('POST', '/forecast', payload),
  addAdjustment: (payload) => request('POST', '/forecast/adjustment', payload),

  // MRP
  calculateMrp: (year, month, asOfDate) =>
    request('GET', `/mrp?year=${year}&month=${month}${asOfDate ? `&asOfDate=${asOfDate}` : ''}`),

  // BOM
  getBomTree: (productId, asOfDate) => request('GET', `/bom/${productId}?asOfDate=${asOfDate}`),
  whereUsed: (type, id) => request('GET', `/bom/where-used/${type}/${id}`),
  addBomDetail: (productId, detail, asOfDate) => request('POST', `/bom/${productId}/detail?asOfDate=${asOfDate}`, detail),
  removeBomDetail: (productId, bomDetailId) => request('DELETE', `/bom/${productId}/detail/${bomDetailId}`),

  // Purchase Order / Receiving
  listPurchaseOrders: () => request('GET', '/po'),
  getPurchaseOrder: (id) => request('GET', `/po/${id}`),
  createPurchaseOrder: (payload) => request('POST', '/po', payload),
  receiveGoods: (poId, lines) => request('POST', `/po/${poId}/receive`, { lines }),

  // Dashboard
  getDashboardPurchasing: (year, month, asOfDate) =>
    request('GET', `/dashboard/purchasing${year ? `?year=${year}&month=${month}&asOfDate=${asOfDate}` : ''}`),
  getDashboardExecutive: (year, month, asOfDate) =>
    request('GET', `/dashboard/executive${year ? `?year=${year}&month=${month}&asOfDate=${asOfDate}` : ''}`),
};
