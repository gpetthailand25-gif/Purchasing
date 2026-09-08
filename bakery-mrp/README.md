# Bakery Purchasing + MRP + BOM — Calculation Engine (Phase 1 Implementation)

โค้ดชุดนี้คือ **STEP 13** ต่อจากเอกสารออกแบบ Phase 1–2: เริ่มจาก Database Schema และ
Calculation Engine (หัวใจของระบบ) ก่อน ตามที่แนะนำไว้ เพราะ API และ Frontend
ทั้งหมดจะพึ่งพา Engine ส่วนนี้

## โครงสร้างไฟล์

```
src/
  db/
    schema.sql              -- PostgreSQL schema เต็มรูปแบบ ตาม Phase 1 STEP 2
    repository.js            -- ต่อ Engine เข้ากับ PostgreSQL จริง (batch-load ผ่าน pg.Pool)
  engine/
    bomExplosion.js          -- Explode BOM หลายระดับ + Aggregate + BOM Cost Roll-up
    mrpCalculation.js        -- Gross -> Net Requirement, Unit Conversion, Production Requirement
    circularCheck.js         -- ตรวจ/ป้องกัน Circular BOM ก่อนบันทึก
    poTracking.js            -- Outstanding / Overdue สำหรับ PO Tracking & Receiving
  services/
    store.js                 -- In-memory Application State + orchestration (ใช้แทน DB จริงชั่วคราว)
  api/
    router.js                -- Router แบบไม่พึ่ง dependency ภายนอก (ใช้ node:http)
    routes.js                -- นิยาม REST endpoint ทั้งหมด (Forecast/MRP/BOM/PO/Receiving)
    server.js                -- Bootstrap HTTP server (`npm start`)
test/
  testData.js                -- In-memory repository จาก Test Data ใน Phase 2 STEP 10
  mockPool.js                -- Mock ของ pg.Pool (fixture rows) สำหรับเทส repository.js
  engine.test.js             -- ทดสอบ STEP 11 (Calculation Trace) + STEP 12 (10 Edge Cases)
  repository.test.js         -- ยืนยันว่า repository.js map ผลลัพธ์ SQL -> repo object ถูกต้อง
  api.test.js                -- เทส REST API แบบ End-to-End (real HTTP server + fetch)
package.json
```

## รันเทส / รัน Server

```
npm test     # รันเทสทั้งหมด (22 tests: Engine + Repository + API)
npm start    # เปิด HTTP Server ที่ http://localhost:3000
```

ผลลัพธ์ปัจจุบัน: **26/26 ผ่านทั้งหมด**

## Authentication / RBAC (STEP 38)

ทุก Endpoint (ยกเว้น `POST /auth/login`) ต้องแนบ `Authorization: Bearer <token>` — ขอ Token ได้จาก:

```bash
curl -X POST localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"buyer1","password":"buyer123"}'
```

Token เป็น JWT-like ที่ Sign ด้วย `node:crypto` (HMAC-SHA256) ล้วน ไม่ต้อง `npm install jsonwebtoken`
อายุ 8 ชั่วโมง — ตั้งค่า Secret จริงผ่าน `JWT_SECRET` env var ก่อนขึ้น Production (ไม่งั้นจะมี
warning เตือนและใช้ dev secret ชั่วคราวแทน)

**Demo Accounts** (รหัสผ่าน Hash ด้วย scrypt เก็บใน `src/auth/users.js`):

| Username | Password | Role | ขอบเขตงาน (ตาม STEP 38) |
|---|---|---|---|
| `admin` | `admin123` | ADMIN | เข้าถึงทุก Endpoint |
| `buyer1` | `buyer123` | PURCHASING | Forecast, MRP, BOM, PO (สร้าง+ดู), Dashboard |
| `wh1` | `wh123` | WAREHOUSE | ดู PO, รับสินค้า (Receiving) เท่านั้น |
| `mgr1` | `mgr123` | MANAGEMENT | ดู Dashboard/Forecast/MRP/BOM/PO อย่างเดียว แก้ไขไม่ได้เลย |

ไม่มี Token หรือ Token หมดอายุ → `401`; มี Token แต่ Role ไม่ตรง → `403`

## REST API (Phase 1 — In-Memory Store)

| Method | Path | Role ที่เข้าถึงได้ | คำอธิบาย |
|---|---|---|---|
| POST | `/auth/login` | Public | ขอ Token |
| GET | `/auth/me` | ทุก Role (Login แล้ว) | ดูข้อมูล User ปัจจุบันจาก Token |
| GET | `/products`, `/materials`, `/suppliers` | ทุก Role | Master Data |
| POST | `/forecast` | PURCHASING | สร้าง/แก้ไข Forecast (เก็บ Version อัตโนมัติ) |
| GET | `/forecast?year=&month=` | PURCHASING, MANAGEMENT | ดู Forecast ของช่วงเวลา |
| POST | `/forecast/adjustment` | PURCHASING | เพิ่ม Forecast ระหว่างเดือน |
| GET | `/mrp?year=&month=&asOfDate=` | PURCHASING, MANAGEMENT | คำนวณ MRP คืน `{ base, incremental }` |
| GET | `/bom/:productId?asOfDate=` | PURCHASING, MANAGEMENT | ดู BOM Tree |
| GET | `/bom/where-used/:type/:id` | PURCHASING, MANAGEMENT | Where Used |
| POST | `/bom/:productId/detail?asOfDate=` | PURCHASING | เพิ่ม BOM Component (ตรวจ Circular ก่อนเสมอ) |
| DELETE | `/bom/:productId/detail/:bomDetailId` | PURCHASING | ลบ BOM Component |
| POST | `/po` | PURCHASING | สร้าง Purchase Order |
| GET | `/po`, `/po/:id` | PURCHASING, WAREHOUSE, MANAGEMENT | PO Tracking |
| POST | `/po/:id/receive` | WAREHOUSE | รับสินค้า (Partial Receiving) |
| GET | `/dashboard/purchasing`, `/dashboard/executive` | PURCHASING, MANAGEMENT | KPI + Charts |

ทดสอบจริงด้วย `curl` ตัวอย่าง:
```bash
npm start &
curl -X POST localhost:3000/forecast -H 'Content-Type: application/json' \
  -d '{"year":2026,"month":8,"productId":"P001","quantity":1000}'
curl "localhost:3000/mrp?year=2026&month=8&asOfDate=2026-08-15"
```

> **หมายเหตุสำคัญ:** `src/services/store.js` เป็น In-Memory Store ชั่วคราว (Seed Data
> ชุดเดียวกับที่ใช้ตรวจทาน Engine มาตลอด) เพื่อให้ API รันและเทสได้จริงในทันทีโดยไม่ต้องมี
> PostgreSQL — พอต่อฐานข้อมูลจริงแล้ว ให้แทนที่การเรียก `toEngineRepo()` ภายใน store.js
> ด้วย `loadCalculationContext()` จาก `src/db/repository.js` (interface เหมือนกันทุก
> ประการ) และย้าย Forecast/BOM/PO logic ไปเป็น SQL แทน Array/Map ในหน่วยความจำ

> Sandbox นี้ไม่มี PostgreSQL server ให้ต่อจริง จึงเทส `repository.js` ผ่าน mock ของ
> `pg.Pool` (`test/mockPool.js`) — แนะนำให้รัน `npm test` ซ้ำอีกครั้งกับ `pg.Pool` จริง
> หลัง `npm install pg` และ apply `schema.sql` แล้ว

## ทำไม Engine แยกจาก Database/API

`src/engine/*.js` เป็น **pure function** ที่รับ `repo` object (interface ง่าย ๆ อย่าง
`getActiveBom`, `getStock`, `getOpenPoQty` ฯลฯ) เป็น dependency แทนที่จะต่อฐานข้อมูลตรง ๆ
ทำให้:

1. เขียน Unit Test ได้โดยไม่ต้องมี PostgreSQL จริง (ดู `test/testData.js` เป็น in-memory repo ตัวอย่าง)
2. `src/db/repository.js` implement interface เดียวกันนี้ด้วย SQL จริง แล้วส่งเข้า
   `calculateMRP(forecastLines, asOfDate, repo)` ได้ทันที โดยไม่ต้องแก้ Logic การคำนวณเลย

## repository.js ทำงานอย่างไร

- **`loadCalculationContext(pool, rootProductIds, asOfDate)`** — โหลด BOM ทั้ง Tree
  (ทุก Level ที่เกี่ยวข้อง) ด้วย Recursive CTE คำสั่งเดียว (`WITH RECURSIVE ... reachable ...`)
  แทนที่จะยิง query ทีละ Node ระหว่าง Explosion (ป้องกันปัญหา N+1 query เวลา BOM ลึก/กว้าง)
  จากนั้น batch-load Stock, Safety Stock, Open PO, Conversion Rate, Price ของทุก Material/
  Semi-Finished ที่เกี่ยวข้องอีก 3 คำสั่ง รวมเป็น 4 query ต่อการคำนวณ MRP หนึ่งรอบ ไม่ว่า BOM
  จะลึกกี่ Level ก็ตาม แล้วประกอบเป็น repo object แบบ synchronous ส่งให้ Engine ใช้ต่อ
- **`checkNewBomEdgeForCycle(pool, parentProductId, componentProductId, asOfDate)`** —
  โหลดกราฟความสัมพันธ์ Semi-Finished ทั้งระบบมาครั้งเดียว แล้วเรียก `wouldCreateCycle()`
  จาก `circularCheck.js` เพื่อตรวจก่อนบันทึก BOM_DETAIL แถวใหม่
- **Open Production Qty / Scheduled Receipt** — สคีมาปัจจุบันยังไม่มีตารางรองรับโดยตรง
  (ต่อยอดได้ในอนาคตตาม STEP 32 เมื่อทำ Production Planning module) ปัจจุบัน default เป็น 0
  ตามที่ comment ไว้ในโค้ด

## ขั้นตอนถัดไป (แนะนำ)

1. `npm install pg`, สร้าง Postgres Database จริง แล้ว apply `src/db/schema.sql`
2. แทนที่ `src/services/store.js` (In-Memory) ด้วยการเรียก `src/db/repository.js` จริง
   ในชั้น API — ตัว route handlers ใน `src/api/routes.js` ไม่ต้องแก้ เพราะเรียกผ่าน
   store interface เดิม
3. เพิ่ม Authentication/RBAC middleware ตาม User Role (STEP 38 Phase 1) ก่อนเข้าแต่ละ route
4. ต่อ Frontend ตาม Wireframe ใน Phase 2 (เริ่มจาก Forecast → MRP → BOM Master/Tree → PO/Receiving)
5. เพิ่ม Export Excel/CSV/PDF (STEP 40) และ Dashboard endpoints (KPI aggregation) เป็นรอบถัดไป
