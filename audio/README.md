# Hymn tunes

Organ recordings of hymn tunes, one MP3 per MHB hymn number (`<number>.mp3`), streamed by the Methodist Hymn Book app. `tunes.json` lists each recording with these fields:

- `tune`: the tune name.
- `mhb`: whether it's the tune the 1933 Methodist Hymn-Book sets for that hymn.
- `mhbTune`: the tune the MHB sets.
- `verses`, `introSeconds`, `verseSeconds`: the verse count and timings.

## Source and licence

The music comes from [The Open Hymnal Project](http://openhymnal.org/) (2014.06 edition). Only scores marked `copyright: public domain` in the Open Hymnal ABC source are used.

Open Hymnal's "public domain" means public domain in the United States. The app is used in countries with a life + 70 years copyright term (the UK, Ghana), so tunes by or arranged by anyone who died less than 70 years ago are left out. In practice that means Ralph Vaughan Williams (d. 1958): Down Ampney, Sine Nomine, and his settings of Kingsfold, Monks Gate and Lasst uns erfreuen. Everyone else used died in 1944 or earlier.

The recordings are synthesised directly from those scores.

## Which tune

1. **The MHB's own tune.** `scripts/tunes/mhb1933-tunes.txt` lists the tune the 1933 Methodist Hymn-Book sets for every hymn, taken from [hymnary.org](https://hymnary.org/hymnal/meth1933). `bytune.mjs` matches those names to Open Hymnal tunes. `metrecheck.mjs` then rejects pairs whose metre doesn't fit the text, which catches different tunes that share a name, such as Lahee's and Open Hymnal's "Nativity". The matches were also reviewed by hand.
2. **Otherwise, a title match.** `match.mjs` matches MHB titles to Open Hymnal texts, and uses the tune Open Hymnal sets for those words (`mhb: false`). The app shows the MHB's tune name alongside these.

`plan.mjs` combines the two.

## How they're made

`render.mjs` cuts out each Open Hymnal MIDI's organ introduction and first verse. Each verse in these files starts with a tempo marker, which gives the boundaries. It then plays the introduction once and the verse once per MHB verse, using a small additive organ synth, and encodes the result as 48 kbps mono MP3. `annotate.mjs` fills in `mhb` and `mhbTune`.

The verse count is derived from the MHB text. Some of the scraped lyrics lost their verse breaks or mark choruses with "Refrain", so the count uses syllables where stanza breaks can't be trusted.

```sh
cd scripts/tunes && npm install
# put OpenHymnal2014.06.abc (as oh.abc) and the unzipped MIDI files (midi/) here
node match.mjs ../../hymns.json
node bytune.mjs && node metrecheck.mjs ../../hymns.json && node plan.mjs
node render.mjs ../../hymns.json ../../audio <hymn numbers...>
node annotate.mjs ../../audio/tunes.json
```
