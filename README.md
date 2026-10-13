# ĐẾ CHẾ VIỆT NAM — Game RTS Web (Clone AoE1, Theme Việt)

> Phase 0: khung monorepo chạy được. Chưa có logic game chi tiết (đúng scope Phase 0).

## Giới thiệu

Game chiến thuật thời gian thực phong cách Age of Empires 1, chơi online trên trình duyệt,
với toàn bộ lớp vỏ Việt hóa thời Hùng Vương – Âu Lạc (văn minh Văn Lang), giữ nguyên 100% cơ chế AoE1.

## Yêu cầu

- **Node.js 20+** (khuyên 20 LTS hoặc 22)
- **pnpm** (cài qua corepack)

## Cài đặt trên Windows (từng bước)

```powershell
# 1. Cài Node.js 20+ từ https://nodejs.org (bản LTS), rồi mở PowerShell mới và kiểm tra:
node --version   # phải ra v20.x trở lên

# 2. Bật pnpm qua corepack (chỉ làm 1 lần):
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version   # kiểm tra

# 3. Cài dependencies (chạy trong thư mục de-che-viet-nam):
cd de-che-viet-nam
pnpm install

# 4. Chạy dev (client + server cùng lúc):
pnpm dev
```

Sau đó mở trình duyệt: **http://localhost:5173** (client), server chạy ở **ws://localhost:2567**.

## Cấu trúc thư mục

```
aoe-web/
├── apps/
│   ├── client/            # Vite + React + Tailwind + Zustand + PixiJS (Phase 1)
│   │   └── src/
│   │       ├── game/      # PixiJS renderer (Phase 1: vẽ map)
│   │       ├── net/       # Colyseus client
│   │       └── ui/        # React: menu, lobby, HUD
│   └── server/            # Node.js + Colyseus (authoritative sim)
│       └── src/rooms/    # BattleRoom.ts
├── packages/
│   ├── sim/               # TRÁI TIM GAME — TypeScript thuần, chạy cả client & server
│   │   └── src/
│   │       ├── data/      # units.ts, buildings.ts, techs.ts, ages.ts (số liệu, tên Việt)
│   │       ├── Game.ts    # vòng lặp sim (skeleton Phase 0)
│   │       ├── rng.ts     # seeded RNG (deterministic)
│   │       └── types.ts   # kiểu dùng chung
│   └── protocol/          # định nghĩa message client<->server dùng chung
├── docker-compose.yml     # dev: server + redis local
└── README.md
```

## Quy ước quan trọng

- **Sim (packages/sim) không được import DOM/WebGL** — cùng code chạy ở client (dự đoán) và server (authoritative).
- Mọi chỉ số game (máu, sát thương, giá) nằm trong `packages/sim/src/data/*.ts` — cân bằng game chỉ sửa số ở đây.
- Tên tiếng Việt lấy từ `your_files/aoe-vietnam-mapping.json`.
- Sim chạy **fixed timestep 20 tick/giây**, RNG có seed (mulberry32) — chuẩn bị cho determinism ở Phase 6.

## Lệnh hay dùng

```powershell
pnpm dev            # chạy client + server
pnpm build          # build tất cả packages
npx tsc --noEmit -p packages/sim   # kiểm tra sim compile sạch
```

## Lộ trình

Xem `your_files/aoe-web-clone-tai-lieu-vibecode.md` (Phase 0→7) và
`your_files/aoe-vietnam-art-plan.md` (plan đồ họa Việt hóa).
