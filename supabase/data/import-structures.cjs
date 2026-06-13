const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const REPO = '/Users/helgijonasgudfinnsson/Desktop/Metabolic/metabolic-hub';
const env = Object.fromEntries(
  fs.readFileSync(REPO + '/.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const catMap = { 'Strength':'strength','Power/Strength':'power_strength','Power':'power','Endurance':'endurance','Burn':'burn' };
(async () => {
  const { error: e1 } = await sb.auth.signInWithPassword({ email:'helgi@metabolic.is', password:'MB-XK9TZAGA4k' });
  if (e1) { console.error('signin failed:', e1.message); process.exit(1); }
  let catalog = JSON.parse(fs.readFileSync('/tmp/mbpb/structures.json','utf8')); { const m=new Map(); catalog.forEach(x=>m.set(x.id,x)); catalog=[...m.values()]; }
  const unmapped = [...new Set(catalog.map(s=>s.category).filter(c=>!catMap[c]))];
  if (unmapped.length) { console.error('UNMAPPED categories:', unmapped); process.exit(1); }
  const rows = catalog.map(s => ({
    source_id: s.id, name: s.name, category: catMap[s.category],
    group_key: s.group || null, levels: s.levels || {}, preview: s.preview || ''
  }));
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('structures').upsert(rows.slice(i, i+200), { onConflict:'source_id' });
    if (error) { console.error('batch', i, 'error:', error.message); process.exit(1); }
    done += Math.min(200, rows.length - i);
  }
  const { count } = await sb.from('structures').select('*', { count:'exact', head:true });
  console.log('imported', done, '/ table count now:', count);
})();
