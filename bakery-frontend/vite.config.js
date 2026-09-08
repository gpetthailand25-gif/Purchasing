import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// เชื่อม Frontend (Vite dev server, port 5173) เข้ากับ Backend API
// (bakery-mrp/src/api/server.js, port 3000) ผ่าน proxy เส้นทาง /api/*
// ทำให้ code ฝั่ง frontend เรียก fetch('/api/forecast') ได้เลยโดยไม่ติด CORS
// แม้ backend จะเปิด CORS ให้แล้วก็ตาม (proxy สะดวกกว่าเวลา deploy จริงหลัง Nginx เดียวกัน)
//
// base: จำเป็นเวลา Deploy ขึ้น GitHub Pages แบบ Project Site เพราะเว็บจะอยู่ที่
// https://<user>.github.io/<repo>/ ไม่ใช่ root — ตั้งผ่าน env VITE_BASE_PATH ตอน build
// (Workflow .github/workflows/gh-pages-deploy.yml ตั้งให้อัตโนมัติตามชื่อ repo)
// ถ้า Deploy ขึ้น Firebase Hosting (root domain) ปล่อยว่างได้ตามปกติ (default '/')
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
