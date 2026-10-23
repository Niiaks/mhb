// Decides which hymns to (re)render with their 1933 MHB tune: candidates.json
// (from bytune.mjs + metrecheck.mjs) minus rejected pairs and Vaughan Williams tunes.
import { readFileSync, writeFileSync } from 'node:fs';

// Different tunes that share a name with an Open Hymnal tune, or failed review.
const REJECT = new Set([53, 73, 85, 147, 157, 176, 210, 248, 288, 401, 481, 487, 514, 572, 614, 652, 676, 772, 800, 808, 942]);
// Ralph Vaughan Williams (d. 1958): in copyright outside the US until the end of 2028.
const RVW = new Set([4, 28, 273, 620, 832, 919]);

const cands = JSON.parse(readFileSync('candidates.json', 'utf8')).filter(
  (c) => c.ok !== 'BAD' || [615, 668, 683, 917].includes(c.number), // metre "failures" caused by lost verse breaks
).filter((c) => !REJECT.has(c.number) && !RVW.has(c.number));

// bytune.mjs picks the single-verse Doxology MIDI for Old 100th; use a full multi-verse one.
for (const c of cands.filter((c) => c.file.startsWith('Praise_God_From_Whom_All_Blessings_Flow-Old_100th'))) {
  c.file = 'Awake_My_Soul_And_With_The_Sun-Old_100th.mid';
  c.ohTitle = 'Awake, My Soul, And With The Sun';
}

const rendered = new Map(JSON.parse(readFileSync('../../audio/tunes.json', 'utf8')).map((t) => [t.number, t]));
const todo = cands.filter((c) => !rendered.get(c.number)?.mhb).map((c) => c.number);
writeFileSync(
  'plan.json',
  JSON.stringify({ todo, files: Object.fromEntries(cands.map((c) => [c.number, { file: c.file, ohTitle: c.ohTitle, metre: c.metre, mhbTune: c.mhbTune }])) }, null, 1),
);
console.log(cands.length, 'hymns have their MHB tune;', todo.length, 'to render:', todo.join(' '));
