# SafeReport

Workplace safety incident reporting system for **Aditya Birla Fashion & Retail** — built for Pantaloons, Allen Solly, Van Heusen, and Peter England retail networks.

SafeReport closes the gap between hazards on the shop floor and management visibility by making reporting frictionless for off-roll staff: **QR scan → 6 screens → under 60 seconds**. Voice notes in any Indian language are automatically transcribed to English via OpenAI Whisper.

> **Team Alpha, IIM Mumbai** — Abhinay Reddy Pochampally, Arpit Raj, Dhruv Tak, Iram Jahan. April 2026.

---

## Three surfaces, one codebase

| Surface | Route | Auth | Users |
|---|---|---|---|
| Reporter PWA | `/r/[sap_code]` | None — name+phone in localStorage | Off-roll staff, sales associates |
| Manager PWA | `/m/[sap_code]` | 4-digit store PIN | Store managers |
| HO Dashboard | `/ho` | Supabase email+password | Safety officers |

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Supabase** — Postgres, Auth, Storage, Realtime
- **OpenAI Whisper** — async voice-to-English transcription
- **Tailwind CSS + shadcn/ui** — styling
- **Recharts** — analytics
- **xlsx (SheetJS)** — Excel bulk operations
- **Web Push (VAPID)** — PWA notifications
- **Railway** — hosting

## Run locally

```bash
# 1. Clone and install
git clone https://github.com/<you>/safereport.git
cd safereport
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — fill Supabase + OpenAI keys

# 3. Provision Supabase
# Open Supabase dashboard → SQL Editor → run in order:
#   supabase/schema.sql
#   supabase/rls.sql
#   supabase/storage.sql
#   supabase/seed.sql
# Then Authentication → Users → Add user → ho@safereport.demo / SafeDemo2026!
# Copy the UUID, uncomment + run the bottom block of seed.sql.

# 4. Run
npm run dev
# Open http://localhost:3000
```

## Demo accounts

| Role | How to enter | Credentials |
|---|---|---|
| HO officer | `/ho/login` | `ho@safereport.demo` / `SafeDemo2026!` |
| Manager, PNT-MUM-047 | `/m/PNT-MUM-047` | PIN `4729` |
| Manager, PNT-MUM-112 | `/m/PNT-MUM-112` | PIN `8361` |
| Manager, PNT-DEL-023 | `/m/PNT-DEL-023` | PIN `2947` |
| Manager, PNT-BLR-089 | `/m/PNT-BLR-089` | PIN `5183` |
| Manager, ALS-MUM-015 | `/m/ALS-MUM-015` | PIN `6724` |
| Manager, ALS-CHN-042 | `/m/ALS-CHN-042` | PIN `9058` |
| Manager, VH-DEL-067 | `/m/VH-DEL-067` | PIN `3182` |
| Manager, VH-BLR-031 | `/m/VH-BLR-031` | PIN `7645` |
| Manager, PE-CHN-018 | `/m/PE-CHN-018` | PIN `1094` |
| Manager, PE-HYD-052 | `/m/PE-HYD-052` | PIN `4516` |
| Reporter (any store) | `/r/PNT-MUM-047` | None |

## Deploy to Railway

```bash
railway login
railway init
railway up
```

Then in the Railway dashboard → Variables tab, paste each key from `.env.local`. Update `NEXT_PUBLIC_APP_URL` to the Railway-provided URL.

Add the same URL to Supabase → Auth → URL Configuration → Redirect URLs.

## Project structure

See `CLAUDE.md` for the full build plan and `docs/DESIGN.md` for the product spec.

## License

Internal academic project. Not for redistribution.
