// Marks each recording with whether it uses the 1933 MHB's own tune, and which tune the MHB sets.
import { readFileSync, writeFileSync } from 'node:fs';
const plan = JSON.parse(readFileSync('plan.json', 'utf8'));
const titleCase = (s) =>
  s.toLowerCase().replace(/\bst\. /g, 'st ').replace(/(^|[\s(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const mhbTunes = new Map();
for (const line of readFileSync('mhb1933-tunes.txt', 'utf8').trim().split('\n')) {
  const [num, tune] = line.split(' | ');
  const n = parseInt(num);
  if (!mhbTunes.has(n)) mhbTunes.set(n, titleCase(tune));
}
const path = process.argv[2];
const tunes = JSON.parse(readFileSync(path, 'utf8')).map((t) => {
  const own = plan.files[t.number];
  return {
    ...t,
    tune: own ? titleCase(own.mhbTune) : t.tune,
    mhb: Boolean(own),
    mhbTune: own ? titleCase(own.mhbTune) : (mhbTunes.get(t.number) ?? ''),
  };
});
writeFileSync(path, JSON.stringify(tunes, null, 1) + '\n');
console.log(tunes.length, 'tunes;', tunes.filter((t) => t.mhb).length, 'use the MHB tune');
for (const t of tunes.filter((t) => !t.mhb)) console.log('  alt', t.number, t.tune, '-> MHB sets', t.mhbTune);
