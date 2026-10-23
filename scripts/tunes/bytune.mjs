// Matches MHB 1933 tune assignments (from hymnary.org) to public-domain Open Hymnal tunes by tune name.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const norm = (s) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\bST\.?\s/g, 'SAINT ').replace(/\bOLD\s(\d+)(ST|ND|RD|TH)\b/g, 'OLD $1').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Open Hymnal: public-domain entries, their tune aliases and MIDI files.
const chunks = readFileSync('oh.abc', 'utf8').split(/^X:/m);
const midis = readdirSync('midi');
const catalogue = [];
for (let i = 1; i < chunks.length; i++) {
  const c = chunks[i];
  if (!/^C:\s*copyright:\s*public domain/im.test(c)) continue;
  const title = c.match(/^T:\s*(.+)$/m)[1].trim();
  const music = c.match(/^C:\s*Music:\s*(.+)$/im)?.[1] ?? '';
  const aliases = [...music.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const key = title.replace(/[^A-Za-z0-9 ]/g, '').replace(/ +/g, '_').toLowerCase();
  for (const f of midis.filter((m) => m.toLowerCase().replace(/[^a-z0-9_.-]/g, '').startsWith(key))) {
    const fileTunes = f.replace(/\.mid$/, '').split('-').slice(1).map((t) => t.replace(/_/g, ' '));
    const names = new Set([...aliases, ...fileTunes].map(norm).filter(Boolean));
    catalogue.push({ file: f, title, names: [...names], metre: chunks[i - 1].match(/%OHMETRICAL\s+(.+)/)?.[1].trim() ?? '' });
  }
}

// hymnary MHB 1933 list: "<n>[a-c] | TUNE"
const mhb = new Map();
for (const line of readFileSync('mhb1933-tunes.txt', 'utf8').trim().split('\n')) {
  const [num, tune] = line.split(' | ');
  const n = parseInt(num);
  const alt = tune.replace(/\(.*?\)/g, '').trim();
  const inner = tune.match(/\((.*?)\)/)?.[1];
  mhb.set(n, [...(mhb.get(n) ?? []), { label: tune, names: [norm(alt), inner && norm(inner)].filter(Boolean) }]);
}

const results = [];
for (const [n, options] of mhb) {
  for (const opt of options) {
    const same = (a, b) => a === b || a.replace(/ /g, '') === b.replace(/ /g, '');
    // Exact (ignoring spaces), else the MHB name is the leading words of a longer Open Hymnal name.
    const hit =
      catalogue.find((c) => opt.names.some((x) => c.names.some((y) => same(x, y)))) ??
      catalogue.find((c) => opt.names.some((x) => x.length >= 5 && c.names.some((y) => y.startsWith(x + ' '))));
    const how = hit && !opt.names.some((x) => hit.names.some((y) => same(x, y))) ? 'prefix' : 'exact';
    if (hit) { results.push({ number: n, mhbTune: opt.label, file: hit.file, ohTitle: hit.title, metre: hit.metre, how }); break; }
  }
}
writeFileSync('bytune.json', JSON.stringify(results, null, 1));
const tunesUsed = new Set(results.map((r) => r.file));
console.log('PD Open Hymnal tune files:', catalogue.length, '| MHB hymns whose own tune is available:', results.length, '| distinct tunes:', tunesUsed.size);
const done = new Set([10,12,34,35,36,91,117,118,125,182,205,271,313,468,538,615,701,860,878,948,13,21,28,82,83,119,121,124,132,137,194,197,215,235,238,239,255,257,273,300,318,335,400,430,475,509,616,646,659,668,693,706,726,776,836,890,919,923,931]);
const byN = new Map(results.map((r) => [r.number, r]));
console.log('of our 59 rendered: MHB tune available', [...done].filter((n) => byN.has(n)).length);
console.log('new hymns gained:', results.filter((r) => !done.has(r.number)).length);

for (const r of results.filter((r) => r.how === 'prefix')) console.log('PREFIX', r.number, r.mhbTune, '->', r.file);
