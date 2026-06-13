# Metabolic Hub

Eitt vistkerfi fyrir Metabolic: opinber heimasíða, iðkenda-svæði og verkfæri þjálfara — byggt á **Next.js 16 + Supabase + Vercel**.

## Hvað er í kerfinu

**Opinber síða (engin innskráning)**
- `/` — hvað er Metabolic, MB1/MB2/MB3, stöðvarnar fjórar, miðlæg innskráning
- `/akademia` — Coach Academy söluborð + waitlist
- `/stod/[slug]` — síða hverrar stöðvar með staðsetningu og tímatöflu

**Iðkenda-svæði (`/app`)**
- **Mín met** — Personal Best (þ.m.t. tímamældar æfingar í mm:ss) með framvindugrafi
- **Dagbók** — álag (RPE), þyngdir og kaloríur eftir hverja æfingu, tengt æfingu dagsins til samanburðar yfir tíma
- Iðkendur sjá **aldrei** æfinguna sjálfa (hún er á töflu/sjónvarpi á stöðinni) — tryggt með RLS

**Þjálfara/admin**
- **Program Builder** — 752 structures, sía eftir stigi (MB1/2/3), 4ra vikna periodization → vikuplan
- Server-hliðar **OptiSigns PDF** af vikunni
- **Stöðin** — yfirlit iðkenda, leaderboards, tímatöflu-ritill
- **Aðildarstjórnun** — samþykkja nýja iðkendur, loka aðgangi, eyða (GDPR)

## Tæknistakk

- Next.js 16 (App Router) · React 19 · Tailwind 4
- Supabase (Postgres + Auth + Storage) með station-scoped RLS — verkefni `wphmeryxmfdxovvnichm` (eu-west-1)
- Vercel hýsing, deploy úr GitHub (`helgi-ops/metabolic-hub`)

## Local dev

```bash
npm install
npm run dev          # keyrir á porti úr .claude/launch.json (3100)
```

Þarf `.env.local` (ekki committað):

```
NEXT_PUBLIC_SUPABASE_URL=...        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # publishable (anon) key
NEXT_PUBLIC_SITE_URL=http://localhost:3100
```

## Deploy

Vercel deploy-ar sjálfkrafa við hvert `git push` á `main`. Umhverfisbreyturnar
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) eru stilltar í
Vercel project settings.

Eftir fyrsta deploy:
1. **Lén:** Vercel → Settings → Domains → bæta `metabolic.is` + DNS records hjá ISNÍC.
2. **Supabase auth redirects:** Authentication → URL Configuration → Site URL +
   `https://metabolic.is/auth/callback` (og `*.vercel.app` fyrir preview).
3. **Supabase Pro:** uppfæra úr ókeypis-tier svo gagnagrunnurinn pásist ekki á notendur.

## Gagnagrunnur

Schema er í `supabase/migrations/` (raðað 01–22). Seed í `supabase/seed.sql` og
`supabase/data/`. Eftir schema-breytingar, endurgerðu types **í heilu lagi** (ekki
hand-breyta — það brýtur typaða clientinn):

```bash
# Supabase MCP: generate_typescript_types  →  src/lib/types/database.ts
```

## Mappa

```
src/app/                 (public síður + (app) verndað svæði + api + auth)
src/lib/supabase/        client.ts / server.ts / middleware.ts
src/lib/auth/            require-staff.ts (gátun á þjálfara/admin)
src/lib/format.ts        mm:ss o.fl.
supabase/migrations/     SQL saga
```
