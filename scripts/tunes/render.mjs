// Renders public-domain Open Hymnal MIDI files into organ-style MP3s for the
// Methodist Hymn Book app: the tune's introduction once, then one verse of the
// tune repeated once per MHB verse.
//
//   node render.mjs <hymns.json> <out dir> [hymn numbers...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import tonejs from '@tonejs/midi';
import { Mp3Encoder } from '@breezystack/lamejs';

const { Midi } = tonejs;
const [HYMNS, OUT, ...only] = process.argv.slice(2);
const hymns = JSON.parse(readFileSync(HYMNS, 'utf8'));
const matches = JSON.parse(readFileSync('matches.json', 'utf8'));
// Hymns whose 1933 MHB tune (per hymnary.org) is in Open Hymnal; see plan.mjs.
const plan = JSON.parse(readFileSync('plan.json', 'utf8'));
// "ST. ANNE" -> "St Anne", "DARWALL'S 148TH" -> "Darwall's 148th"
const titleCase = (s) =>
  s.toLowerCase().replace(/st. /g, 'st ').replace(/(^|[s(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

const PILOT = [10, 12, 34, 35, 36, 91, 117, 118, 125, 182, 205, 271, 313, 468, 538, 615, 701, 860, 878, 948];
const RATE = 22050;

// Tune metadata (%OHMETRICAL etc.) sits before each X: line, so it belongs to the next chunk.
const chunks = readFileSync('oh.abc', 'utf8').split(/^X:/m);
const abcMeta = {};
for (let i = 1; i < chunks.length; i++) {
  const title = chunks[i].match(/^T:\s*(.+)$/m)[1].trim();
  abcMeta[title] = {
    metre: chunks[i - 1].match(/%OHMETRICAL\s+(.+)/)?.[1].trim() ?? '',
    music: chunks[i].match(/^C:\s*Music:\s*(.+)$/im)?.[1].trim() ?? '',
  };
}

const syllables = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z' ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .reduce((n, w) => n + Math.max(1, (w.replace(/'/g, '').replace(/e$/, '').match(/[aeiouy]+/g) || []).length), 0);

/**
 * Where the melody inside [start, end) first repeats, i.e. where verse 2 starts
 * if the section holds several verses. Returns `end` when nothing repeats.
 */
function firstRepeat(midi, start, end) {
  const tracks = midi.tracks.filter((t) => t.notes.length);
  const avg = (t) => t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length;
  const melody = tracks.reduce((a, b) => (avg(a) >= avg(b) ? a : b)).notes.filter((n) => n.time >= start - 0.01 && n.time < end - 0.01);
  const pitches = melody.map((n) => n.midi);
  for (let p = 8; p <= pitches.length / 2; p++) {
    let same = 0;
    for (let i = 0; i + p < pitches.length; i++) if (pitches[i] === pitches[i + p]) same++;
    if (same / (pitches.length - p) > 0.9) return melody[p].time;
  }
  return end;
}

/**
 * Open Hymnal MIDIs start with a short organ introduction, and every verse
 * starts with a tempo marker, so the markers give the verse boundaries. A few
 * files mark only the start of the verses; then the melody's first repeat does.
 */
function sections(midi) {
  const starts = [...new Set(midi.header.tempos.map((t) => Number(t.time.toFixed(3))))].filter((t) => t > 0);
  if (starts.length < 2) throw new Error('no verse markers');
  const verseStart = starts[0];
  const nextVerse = firstRepeat(midi, verseStart, starts[1]);
  const notes = midi.tracks.flatMap((t) => t.notes);
  return {
    intro: notes.filter((n) => n.time < verseStart - 0.01),
    introSeconds: verseStart,
    verse: notes
      .filter((n) => n.time >= verseStart - 0.01 && n.time < nextVerse - 0.01)
      .map((n) => ({ midi: n.midi, velocity: n.velocity, time: n.time - verseStart, duration: n.duration })),
    verseSeconds: nextVerse - verseStart,
  };
}

/**
 * How many verses the MHB text has. The scraped lyrics mark a chorus with a
 * "Refrain" line (the chorus text appears once, with or after the first one),
 * some hymns split each verse into two stanzas, and some lost their verse
 * breaks entirely.
 */
function verseCount(hymn, metre) {
  const { stanzas } = hymn;
  const lines = (s) => s.split('\n');

  // With a refrain: count the stanzas that hold anything besides the refrain.
  const first = stanzas.findIndex((s) => lines(s)[0] === 'Refrain');
  if (first >= 0) {
    const refrainText = stanzas[first] === 'Refrain' ? (stanzas[first + 1] ?? '') : stanzas[first];
    const refrain = new Set(lines(refrainText).filter((l) => l !== 'Refrain'));
    return stanzas.filter((s) => lines(s).some((l) => l !== 'Refrain' && !refrain.has(l))).length;
  }

  if (!/^[\d ]+$/.test(metre)) return stanzas.length;
  const perVerse = metre.split(' ').reduce((a, b) => a + Number(b), 0);

  // Clean stanzas (each about one tune verse long) count directly; otherwise go by syllables.
  const ratio = syllables(stanzas[0]) / perVerse;
  if (stanzas.every((s) => lines(s).length >= 2) && ratio > 0.8 && ratio < 1.25) return stanzas.length;
  return Math.max(1, Math.round(syllables(stanzas.join(' ')) / perVerse));
}

// A small additive "flue pipe" organ: a few harmonics, quick attack, short release.
const HARMONICS = [
  [1, 1],
  [2, 0.45],
  [3, 0.22],
  [4, 0.16],
  [6, 0.07],
  [8, 0.05],
];

function render({ intro, introSeconds, verse, verseSeconds }, verses) {
  const events = [
    ...intro,
    ...Array.from({ length: verses }, (_, v) =>
      verse.map((n) => ({ ...n, time: n.time + introSeconds + v * verseSeconds })),
    ).flat(),
  ];
  const total = Math.ceil((introSeconds + verseSeconds * verses + 1.5) * RATE);
  const buf = new Float32Array(total);
  const attack = 0.025 * RATE;
  const release = 0.09 * RATE;
  for (const n of events) {
    const freq = 440 * 2 ** ((n.midi - 69) / 12);
    const start = Math.floor(n.time * RATE);
    const len = Math.floor(n.duration * RATE);
    const amp = 0.16 * (0.6 + 0.4 * n.velocity);
    const partials = HARMONICS.filter(([h]) => freq * h < RATE / 2).map(([h, a]) => [(2 * Math.PI * freq * h) / RATE, a]);
    for (let i = 0; i < len + release && start + i < total; i++) {
      const env = i < attack ? i / attack : i < len ? 1 : 1 - (i - len) / release;
      let s = 0;
      for (const [w, a] of partials) s += a * Math.sin(w * i);
      buf[start + i] += amp * env * s;
    }
  }
  // Normalise to -1 dBFS.
  let peak = 0;
  for (const s of buf) peak = Math.max(peak, Math.abs(s));
  const gain = 0.89 / peak;
  const pcm = new Int16Array(total);
  for (let i = 0; i < total; i++) pcm[i] = Math.round(buf[i] * gain * 32767);
  return pcm;
}

function mp3(pcm) {
  const enc = new Mp3Encoder(1, RATE, 48);
  const parts = [];
  for (let i = 0; i < pcm.length; i += 1152) parts.push(enc.encodeBuffer(pcm.subarray(i, i + 1152)));
  parts.push(enc.flush());
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

mkdirSync(OUT, { recursive: true });
const list = only.length ? only.map(Number) : PILOT;
const tunes = [];
for (const number of list) {
  const hymn = hymns.find((h) => h.number === number);
  // Prefer the tune the 1933 MHB sets (plan.json, from hymnary.org); else the title match.
  const mhb = plan.files[number];
  const match = matches.find((m) => m.number === number);
  const file = mhb?.file ?? match.files[0];
  const meta = abcMeta[mhb?.ohTitle ?? match.oh] ?? { metre: '', music: '' };
  let parts;
  try {
    parts = sections(new Midi(readFileSync(`midi/${file}`)));
  } catch (e) {
    console.log('SKIP', number, hymn.title, '|', file, '|', e.message);
    continue;
  }
  const verses = verseCount(hymn, meta.metre);
  const data = mp3(render(parts, verses));
  writeFileSync(`${OUT}/${number}.mp3`, data);

  const tune = mhb ? titleCase(mhb.mhbTune) : file.replace(/\.mid$/, '').split('-')[1].replace(/_/g, ' ');
  tunes.push({
    number,
    tune,
    music: meta.music,
    verses,
    mhb: Boolean(mhb),
    introSeconds: Number(parts.introSeconds.toFixed(2)),
    verseSeconds: Number(parts.verseSeconds.toFixed(2)),
    source: `http://openhymnal.org/ (${file})`,
  });
  console.log(
    number, hymn.title, '|', tune, '| verses', verses, `(${hymn.stanzas.length} stanzas)`,
    '| intro', parts.introSeconds.toFixed(1) + 's | verse', parts.verseSeconds.toFixed(1) + 's |',
    (data.length / 1024).toFixed(0) + 'KB',
  );
}
// Merge into the existing index, so rendering a few hymns doesn't drop the others.
let existing = [];
try {
  existing = JSON.parse(readFileSync(`${OUT}/tunes.json`, 'utf8'));
} catch {}
const merged = [...existing.filter((t) => !list.includes(t.number)), ...tunes].sort((a, b) => a.number - b.number);
writeFileSync(`${OUT}/tunes.json`, JSON.stringify(merged, null, 1) + '\n');
console.log(`tunes.json now lists ${merged.length} tunes`);
