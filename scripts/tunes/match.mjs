import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const hymns = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const norm = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const abc = readFileSync('oh.abc', 'utf8').split(/^X:/m).slice(1);
const entries = abc.map((block) => {
  const titles = [...block.matchAll(/^T:\s*(.+)$/gm)].map((m) => m[1].trim());
  const copyright = (block.match(/^C:\s*copyright:\s*(.+)$/im) || [])[1] ?? '';
  const music = (block.match(/^C:\s*Music:\s*(.+)$/im) || [])[1] ?? '';
  const words = (block.match(/^W?:?\s*1\.\s*(.+)$/m) || [])[1] ?? '';
  return { x: block.match(/^\s*(\d+)/)[1], titles, copyright, music };
});
const midis = readdirSync('midi');
const results = [];
for (const h of hymns) {
  const t = norm(h.title);
  const first = norm(h.stanzas[0].split('\n')[0]);
  const e = entries.find((e) => e.titles.some((x) => norm(x) === t || norm(x) === first));
  if (!e) continue;
  const key = e.titles[0].replace(/[^A-Za-z0-9 ]/g, '').replace(/ +/g, '_').toLowerCase();
  const files = midis.filter((m) => m.toLowerCase().replace(/[^a-z0-9_.-]/g, '').startsWith(key));
  results.push({ number: h.number, title: h.title, oh: e.titles[0], pd: /^public domain/i.test(e.copyright), copyright: e.copyright.slice(0, 60), music: e.music.slice(0, 70), files });
}
writeFileSync('matches.json', JSON.stringify(results, null, 1));
console.log(results.length, 'matches;', results.filter((r) => r.pd && r.files.length).length, 'public domain with MIDI');
for (const r of results) console.log(r.number, '|', r.title, '|', r.pd ? 'PD' : 'NOT-PD', '|', r.files.join(',') || 'NO MIDI', '|', r.music);
