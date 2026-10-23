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
 * Open Hymnal MIDIs start with a short organ introduction, and every verse
 * starts with a tempo marker, so the markers give the verse boundaries.
 */
function sections(midi) {
  const starts = [...new Set(midi.header.tempos.map((t) => Number(t.time.toFixed(3))))].filter((t) => t > 0);
  if (starts.length < 2) throw new Error('no verse markers');
  const [verseStart, nextVerse] = starts;
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
 * How many verses the MHB text has. The scraped lyrics write a chorus as a
 * "Refrain" placeholder stanza (with the chorus text once, after the first
 * placeholder), and some hymns lost their verse breaks entirely.
 */
function verseCount(hymn, metre) {
  const first = hymn.stanzas.indexOf('Refrain');
  const stanzas = hymn.stanzas.filter((s, i) => s !== 'Refrain' && !(first >= 0 && i === first + 1));
  // Syllables are reliable for a regular metre without a refrain; otherwise count stanzas.
  if (first >= 0 || !/^[\d ]+$/.test(metre)) return stanzas.length;
  const perVerse = metre.split(' ').reduce((a, b) => a + Number(b), 0);
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
  const match = matches.find((m) => m.number === number);
  const file = match.files[0];
  const meta = abcMeta[match.oh] ?? { metre: '', music: '' };
  const parts = sections(new Midi(readFileSync(`midi/${file}`)));
  const verses = verseCount(hymn, meta.metre);
  const data = mp3(render(parts, verses));
  writeFileSync(`${OUT}/${number}.mp3`, data);

  const tune = file.replace(/\.mid$/, '').split('-')[1].replace(/_/g, ' ');
  tunes.push({
    number,
    tune,
    music: meta.music,
    verses,
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
if (!only.length) writeFileSync(`${OUT}/tunes.json`, JSON.stringify(tunes, null, 1));
