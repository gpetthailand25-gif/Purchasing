'use strict';

const crypto = require('node:crypto');

/**
 * users.js — User store แบบ In-Memory พร้อม Password Hashing ด้วย scrypt
 * (node:crypto ในตัว ไม่ต้อง npm install bcrypt) ตาม Role ที่กำหนดไว้ใน
 * Phase 1 STEP 38: ADMIN, PURCHASING, WAREHOUSE, MANAGEMENT
 */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash);
  const b = Buffer.from(candidate);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// รหัสผ่าน seed (เปลี่ยนได้จริงในระบบ production ผ่านหน้า Admin > Users)
const users = [
  { username: 'admin', fullName: 'ผู้ดูแลระบบ', role: 'ADMIN', passwordHash: hashPassword('admin123') },
  { username: 'buyer1', fullName: 'ฝ่ายจัดซื้อ 1', role: 'PURCHASING', passwordHash: hashPassword('buyer123') },
  { username: 'wh1', fullName: 'คลังสินค้า 1', role: 'WAREHOUSE', passwordHash: hashPassword('wh123') },
  { username: 'mgr1', fullName: 'ผู้บริหาร', role: 'MANAGEMENT', passwordHash: hashPassword('mgr123') },
];

function findUser(username) {
  return users.find((u) => u.username === username);
}

function authenticate(username, password) {
  const user = findUser(username);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return { username: user.username, fullName: user.fullName, role: user.role };
}

module.exports = { findUser, authenticate };
