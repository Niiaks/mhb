import { readFileSync, writeFileSync } from 'node:fs';
const hymns = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const REJECT = new Set([73, 147, 614, 248, 676, 288, 487, 210]);
const cands = JSON.parse(readFileSync('bytune.json', 'utf8')).filter((r) => !REJECT.has(r.number));
const syl = (t) => t.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean)
  .reduce((n, w) => n + Math.max(1, (w.replace(/'/g, '').replace(/e$/, '').match(/[aeiouy]+/g) || []).length), 0);
const out = [];
for (const r of cands) {
  const h = hymns.find((x) => x.number === r.number);
  const st = h.stanzas.find((s) => s !== 'Refrain' && s.split('\n').length > 1) ?? h.stanzas[0];
  const lines = st.split('\n').filter((l) => l !== 'Refrain').map(syl);
  const numeric = /^[\d ]+$/.test(r.metre);
  const tune = numeric ? r.metre.split(' ').map(Number) : null;
  const tsum = tune?.reduce((a, b) => a + b, 0);
  const ssum = lines.reduce((a, b) => a + b, 0);
  // Ratio of a stanza to one tune verse: ~1, ~0.5 (half verses) or ~2 are all consistent.
  const ratio = tsum ? ssum / tsum : null;
  const ok = ratio === null ? '?' : [0.5, 1, 2].some((k) => Math.abs(ratio / k - 1) < 0.17) ? 'ok' : 'BAD';
  out.push({ ...r, title: h.title, text: lines.join(' '), ratio: ratio?.toFixed(2), ok });
}
writeFileSync('candidates.json', JSON.stringify(out, null, 1));
for (const o of out) console.log(o.ok.padEnd(3), String(o.number).padEnd(4), o.title.slice(0, 32).padEnd(32), '|', o.mhbTune.slice(0, 22).padEnd(22), '| text', o.text.slice(0, 22).padEnd(22), '| tune', o.metre.slice(0, 22).padEnd(22), o.ratio ?? '');
console.log(out.filter((o) => o.ok === 'ok').length, 'ok,', out.filter((o) => o.ok === 'BAD').length, 'bad,', out.filter((o) => o.ok === '?').length, 'unknown');
