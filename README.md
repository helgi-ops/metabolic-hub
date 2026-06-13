# Metabolic Hub

Heimasíða og Coach Academy fyrir metabolic.is. Next.js 15 + Supabase + Vercel.

## Hvað er búið og klárt

- **Supabase project** `Metabolic` (`wphmeryxmfdxovvnichm`, eu-west-1)
  - Database schema (15 töflur, RLS pólísíur, helper functions)
  - Storage buckets (avatars, course-covers, exercise-thumbnails, certificates, weekly-plan-pdfs, submission-attachments)
  - Auth trigger sem býr sjálfkrafa til profile fyrir hvern nýjan notanda
  - Allar öryggis-aðvaranir (linter) hreinsaðar
- **Next.js skeleton**
  - Landing page með waitlist signup (skrifar í `email_signups`)
  - Innskráning / nýskráning (Supabase Auth)
  - `/app` dashboard (protected, með sign out)
  - Middleware sem refresh-ar session og verndar `/app/*`
  - Server + browser Supabase client með TypeScript types

## Næstu skref (sem þú þarft að klára á þínum vél)

### 1. Installa dependencies

Sandbox umhverfið mitt klárar ekki `npm install` innan tímamarka vegna stærðar Next.js dependency tree. Keyrðu á vélinni þinni:

```bash
cd ~/Desktop/Metabolic/metabolic-hub
npm install
```

### 2. Prófaðu lokalt

```bash
npm run dev
```

Opnaðu http://localhost:3000 — landing page á að birtast. Prófaðu:
- Skrá netfang í waitlist (athugaðu í Supabase `email_signups` töflunni)
- Búa til aðgang á `/signup`
- Skrá inn á `/login`
- Skoða `/app` dashboard

### 3. Settu sjálfan þig sem admin

Eftir að þú hefur búið til þinn fyrsta aðgang, opnaðu Supabase SQL editor og keyrðu:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'helgi@metabolic.is');
```

### 4. Deploy á Vercel

```bash
# Frá metabolic-hub möppunni:
npx vercel login           # einu sinni — opnar browser
npx vercel link            # tengir möppuna við Vercel project (búðu til nýtt)
npx vercel env add NEXT_PUBLIC_SUPABASE_URL          # límdu inn URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY     # límdu inn anon key
npx vercel env add NEXT_PUBLIC_SITE_URL              # https://metabolic.is þegar lén er klárt
npx vercel --prod          # deploy
```

Eða einfaldara: pushaðu á GitHub og connect-aðu repoið við Vercel via vercel.com/new.

### 5. Connect metabolic.is lénið

Eftir fyrsta deploy:
1. Vercel → þitt project → Settings → Domains → Add `metabolic.is`
2. Vercel sýnir hvaða DNS records þú þarft hjá ISNÍC (A record + CNAME fyrir www)
3. Bíddu eftir SSL útgáfu (~5 mín)

### 6. Stilltu Supabase auth redirects

Í Supabase → Authentication → URL Configuration:
- **Site URL:** `https://metabolic.is`
- **Redirect URLs:** bæta við `https://metabolic.is/auth/callback`, `https://*.vercel.app/auth/callback` (fyrir preview deploys), og `http://localhost:3000/auth/callback` (fyrir local dev)

## Env vars

Sjá `.env.local` (ekki committað) og `.env.example` (template).

```
NEXT_PUBLIC_SUPABASE_URL=https://wphmeryxmfdxovvnichm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_hiAlVHV4Ki_RKWUdujKKpA_YSd7Kcrx
NEXT_PUBLIC_SITE_URL=http://localhost:3000   # uppfærðu í production
```

## Möppustaður

```
metabolic-hub/
├── src/
│   ├── app/
│   │   ├── page.tsx                    Landing page
│   │   ├── layout.tsx                  Root layout
│   │   ├── globals.css                 Tailwind + theme
│   │   ├── login/                      Innskráning
│   │   ├── signup/                     Nýskráning
│   │   ├── auth/
│   │   │   ├── callback/route.ts       Email confirmation
│   │   │   └── signout/route.ts        Logout
│   │   ├── api/waitlist/route.ts       Waitlist endpoint
│   │   └── (app)/
│   │       ├── layout.tsx              Auth-protected layout
│   │       └── app/page.tsx            Dashboard
│   ├── components/
│   │   └── waitlist-form.tsx
│   └── lib/
│       ├── supabase/
│       │   ├── client.ts               Browser client
│       │   ├── server.ts               Server client
│       │   └── middleware.ts           Session refresh helper
│       └── types/
│           └── database.ts             Auto-generated frá Supabase
├── middleware.ts                       Top-level middleware
└── ...
```

## Næstu áfangar (sjá `../metabolic-hub-plan.md`)

- Áfangi 1: Restin af public síðunni (/adferd, /timataflur, /blogg, /um, /akademia)
- Áfangi 2: Course player (video + framvinda) — Track 2 MVP
- Áfangi 3: Program Builder v2 migrate-aður yfir á þennan stack
- Áfangi 4: Track 1 með assignment system + cert generation
- Áfangi 5: OptiSigns + weekly_plans integration

## Regenerate Database types

Eftir schema breytingar í Supabase:

```bash
npx supabase gen types typescript --project-id wphmeryxmfdxovvnichm > src/lib/types/database.ts
```

Eða biddu Claude að gera það — Supabase MCP-ið heitir `generate_typescript_types`.
