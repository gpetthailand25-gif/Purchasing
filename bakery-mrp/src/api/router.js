'use strict';

const { verify } = require('../auth/token');

/**
 * Router แบบไม่พึ่ง Dependency ภายนอก (ใช้ node:http ล้วน)
 * เพราะ sandbox นี้ไม่มีเน็ตให้ npm install express — แต่ handler แต่ละตัวเขียน
 * เป็น async function({ params, query, body, user }) -> { status, body } ซึ่งพอร์ตไป
 * ใช้กับ Express จริงตอน Deploy ได้ง่าย (แค่ห่อ req/res บาง ๆ)
 *
 * RBAC: แต่ละ route ประกาศ roles ที่อนุญาตได้ผ่าน options.roles
 *   - ไม่ระบุ (undefined)  -> Public, ไม่ต้อง Login
 *   - 'AUTH'                -> ต้อง Login แต่ Role ใดก็ได้ (เช่น GET /auth/me)
 *   - ['PURCHASING', ...]   -> ต้อง Login และ Role ต้องอยู่ในลิสต์ (ADMIN ผ่านเสมอ)
 */
function createRouter() {
  const routes = [];

  function add(method, path, handler, options = {}) {
    const paramNames = [];
    const regexPath = path
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          paramNames.push(segment.slice(1));
          return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    const pattern = new RegExp(`^${regexPath}/?$`);
    routes.push({ method, pattern, paramNames, handler, roles: options.roles });
  }

  async function handle(req, res) {
    // CORS: อนุญาตให้ Frontend ที่รันคนละ origin (เช่น Vite dev server) เรียก API นี้ได้
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());

    for (const route of routes) {
      if (route.method !== req.method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });

      let body = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        body = await readJsonBody(req);
      }

      let user = null;
      if (route.roles) {
        try {
          const authHeader = req.headers.authorization || '';
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
          user = verify(token);
        } catch (e) {
          writeJson(res, 401, { error: 'กรุณาเข้าสู่ระบบ (Token ไม่ถูกต้องหรือหมดอายุ)' });
          return;
        }
        const allowedRoles = route.roles === 'AUTH' ? null : route.roles;
        if (allowedRoles && user.role !== 'ADMIN' && !allowedRoles.includes(user.role)) {
          writeJson(res, 403, { error: `Role "${user.role}" ไม่มีสิทธิ์เข้าถึงส่วนนี้` });
          return;
        }
      }

      try {
        const result = await route.handler({ params, query, body, user });
        writeJson(res, result.status || 200, result.body ?? {});
      } catch (err) {
        writeJson(res, err.status || 500, { error: err.message });
      }
      return;
    }

    writeJson(res, 404, { error: 'Not Found', path: pathname });
  }

  return {
    get: (path, handler, options) => add('GET', path, handler, options),
    post: (path, handler, options) => add('POST', path, handler, options),
    put: (path, handler, options) => add('PUT', path, handler, options),
    delete: (path, handler, options) => add('DELETE', path, handler, options),
    handle,
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

/** Helper สำหรับ handler โยน HTTP error พร้อม status code ที่ต้องการ */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { createRouter, HttpError };
