# Bakery Purchasing / MRP / BOM — Frontend (Vite + React + Tailwind)

Frontend จริงที่รวม 4 หน้าหลัก (Forecast, MRP, BOM, PO/Receiving) เป็นโปรเจกต์เดียว
พร้อม Routing และเชื่อมกับ Backend API (`bakery-mrp/src/api/server.js`) ที่สร้างไว้
ในรอบก่อนหน้าโดยตรง — ไม่ใช่ไฟล์ Artifact เดี่ยว ๆ ที่มี Seed Data ในตัวเองอีกต่อไป

## โครงสร้างโปรเจกต์

```
src/
  main.jsx              -- entry point (BrowserRouter)
  App.jsx                -- route definitions + RequireAuth guard
  index.css              -- Tailwind + font import
  lib/
    api.js                -- fetch wrapper รวม endpoint ทั้งหมดของ Backend (แนบ Bearer token อัตโนมัติ)
    auth.jsx              -- AuthContext: login/logout, token persistence (localStorage), auto-logout เมื่อโดน 401
  components/
    Layout.jsx            -- Sidebar navigation (กรองเมนูตาม Role) + แสดงผู้ใช้ปัจจุบัน/ปุ่ม Logout
    ui.jsx                -- Shared UI: KpiCard, StatusBadge, TypeTag, Loading/Error state
  pages/
    LoginPage.jsx          -- หน้า Login (มี Demo Account ให้คลิกกรอกอัตโนมัติ)
    ForecastPage.jsx       -- Forecast ประจำเดือน + Adjustment (เชื่อม API จริง)
    MrpPage.jsx             -- MRP calculation (เชื่อม API จริง)
    BomPage.jsx             -- BOM Master / Tree / Where Used (เชื่อม API จริง)
    PoTrackingPage.jsx      -- PO Tracking (เชื่อม API จริง)
    CreatePoPage.jsx        -- สร้าง PO (เชื่อม API จริง)
    ReceivingPage.jsx       -- รับสินค้า (เชื่อม API จริง)
    DashboardPage.jsx       -- Purchasing/Executive Dashboard (เชื่อม API จริง)
package.json / vite.config.js / tailwind.config.js / postcss.config.js
```

## Login

เปิดแอปครั้งแรกจะเจอหน้า Login — ใช้ Demo Account ใดก็ได้ (คลิกที่รายการในหน้า Login
เพื่อกรอกให้อัตโนมัติ): `admin/admin123`, `buyer1/buyer123`, `wh1/wh123`, `mgr1/mgr123`
เมนู Sidebar จะกรองตาม Role อัตโนมัติ (เช่น `wh1` จะเห็นแค่ PO Tracking + Receiving)
ตรงกับ RBAC ฝั่ง Backend ทุกประการ — กด Route ตรง ๆ ที่ไม่มีสิทธิ์จะได้ 403 จาก API เช่นกัน
(กันสองชั้น ไม่ใช่แค่ซ่อนเมนู)

## วิธีรัน (ต้องมีเน็ตเพื่อ npm install ครั้งแรก)

Terminal 1 — Backend:
```bash
cd bakery-mrp
npm install
npm start          # http://localhost:3000
```

Terminal 2 — Frontend:
```bash
cd bakery-frontend
npm install
npm run dev         # http://localhost:5173
```

Vite proxy เส้นทาง `/api/*` → `http://localhost:3000/*` ให้อัตโนมัติ (ดู `vite.config.js`)
ไม่ต้องตั้งค่า CORS เพิ่ม (แต่ backend ก็เปิด CORS ไว้ให้แล้วเผื่อ deploy แยก origin จริง)

## ⚠️ ข้อจำกัดของ Sandbox นี้ — สิ่งที่ยังไม่ได้ทดสอบจริง

Sandbox ที่ใช้เขียนโค้ดนี้ไม่มีอินเทอร์เน็ต จึง **รัน `npm install` ไม่ได้เลย**
(ยืนยันแล้วว่า registry.npmjs.org ถูก block ที่ระดับ network) ทำให้:

- **ไม่ได้รัน `npm run dev` หรือ `npm run build` จริง** — โค้ดทั้งหมดเขียนตาม pattern
  ของ React 18 + react-router-dom v6 + Tailwind v3 มาตรฐาน และตรวจสอบ bracket/JSX
  balance ด้วยสคริปต์แยกแล้ว แต่ยังไม่ผ่านการ compile จริงด้วย Vite
- Backend (`bakery-mrp`) ยังคงผ่านเทสอัตโนมัติทั้งหมด (22/22) และรันเป็น HTTP
  server จริงมาตลอด — ส่วนนี้เชื่อถือได้เต็มที่
- **แนะนำให้รัน `npm install && npm run dev` ที่เครื่องคุณเป็นก้าวแรก** แล้วเปิด
  browser console เพื่อดู error หากมี — ถ้าเจอ error สามารถส่งกลับมาให้แก้ต่อได้ทันที

## Dashboard คำนวณจากข้อมูลจริงแล้ว

`GET /dashboard/purchasing` และ `GET /dashboard/executive` คำนวณจาก Forecast/MRP/PO/Stock
ที่มีอยู่จริงใน Store — ไม่ใช้ตัวเลขสมมติอีกต่อไป ที่ควรรู้ไว้:

- **มูลค่าการจัดซื้อรายเดือน** และ **Forecast vs Actual** จะ "บาง" ในระบบที่เพิ่ง Seed ใหม่
  เพราะยังไม่มีประวัติ PO หลายเดือนสะสม — เป็นพฤติกรรมที่ถูกต้องของระบบจริง ไม่ใช่บั๊ก
  กราฟจะมีข้อมูลมากขึ้นเรื่อย ๆ ตามการใช้งาน
- **Price Increase Alert** มาจาก Log ที่บันทึกอัตโนมัติเมื่อสร้าง PO ด้วยราคาที่ต่างจาก
  `current_price` ของ Material — ไม่มี PO ใหม่ = ไม่มี Price History ใหม่
- **Forecast Value** คำนวณผ่าน BOM Cost Roll-up จริง (`calculateBomCost` ใน
  `bomExplosion.js`) ไม่ใช่การประมาณ
- Lead Time ในตาราง Material Risk/BOM ถูกตัดออก เพราะ `materials` master ปัจจุบันยังไม่ผูก
  กับ Supplier รายตัว (มีแค่ `primarySupplierId` concept ที่ schema.sql รองรับ แต่ store.js
  ในเมมโมรียังไม่ผูกจริง) — เพิ่มได้ในรอบถัดไปถ้าต้องการ

## Known gaps (สิ่งที่ยังไม่ครบเทียบกับ Spec เต็ม)

- Purchase Order ยังไม่มีขั้นตอนอนุมัติแยก Role ผู้อนุมัติจริง (STEP 24) — RBAC ตอนนี้แยกแค่
  "ใครสร้าง PO ได้" (PURCHASING) กับ "ใครรับสินค้าได้" (WAREHOUSE) แต่ยังไม่มี Role
  "ผู้อนุมัติ" แยกต่างหากที่ต้องกดอนุมัติก่อนส่ง Supplier
- User Management (Admin > Users) ยังไม่มีหน้า UI — ผู้ใช้ถูก Seed ไว้ตายตัวใน
  `src/auth/users.js` ฝั่ง Backend เท่านั้น
- Audit Log (STEP 37) ยังไม่ได้เก็บ — ตอนนี้รู้แค่ว่าใคร Login แต่ยังไม่ log ว่าใครแก้อะไร

## ขั้นตอนถัดไปที่แนะนำ

1. รัน `npm install` ทั้งสองโปรเจกต์ที่เครื่องคุณ แล้วยืนยันว่า build ผ่านจริง
2. เพิ่ม Authentication/RBAC ตาม User Role (STEP 38) ก่อนขึ้นใช้งานจริง
3. ต่อ PostgreSQL จริงแทน In-Memory Store (`src/db/repository.js` พร้อมใช้แล้วจากรอบก่อน)
4. ผูก Material เข้ากับ Supplier รายตัว + Lead Time ให้ครบ เพื่อให้ Dashboard/BOM แสดง
   Lead Time ได้ตามสเปกเต็ม
