'use strict';

const crypto = require('node:crypto');

/**
 * token.js — JWT-like signed token โดยใช้ node:crypto ล้วน (ไม่ต้อง npm install
 * jsonwebtoken) รูปแบบ: base64url(header).base64url(payload).base64url(HMAC-SHA256)
 * เพียงพอสำหรับ Auth ภายในของระบบนี้ — ถ้าจะขึ้น Production จริงแนะนำสลับไปใช้
 * ไลบรารี JWT มาตรฐานที่ผ่านการ audit แล้วแทน
 */

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-CHANGE-ME-in-production';
if (!process.env.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn('[auth] JWT_SECRET ไม่ได้ตั้งค่า — ใช้ dev secret ชั่วคราว ห้ามใช้ค่านี้ใน Production');
}

const DEFAULT_EXPIRY_SECONDS = 8 * 60 * 60; // 8 ชั่วโมง (1 กะทำงาน)

function base64url(input) {
  return Buffer.from(typeof input === 'string' ? input : JSON.stringify(input))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(payload, expiresInSeconds = DEFAULT_EXPIRY_SECONDS) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const encodedHeader = base64url(header);
  const encodedPayload = base64url(fullPayload);
  const signature = crypto.createHmac('sha256', SECRET).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') throw new Error('ไม่พบ Token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token ไม่ถูกต้อง');
  const [encodedHeader, encodedPayload, signature] = parts;

  const expectedSignature = crypto.createHmac('sha256', SECRET).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Token signature ไม่ถูกต้อง');
  }

  const payload = JSON.parse(base64urlDecode(encodedPayload));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token หมดอายุแล้ว');
  }
  return payload;
}

module.exports = { sign, verify };
