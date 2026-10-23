# Hymn tunes

Organ recordings of hymn tunes, one MP3 per MHB hymn number (`<number>.mp3`), streamed by the Methodist Hymn Book app. `tunes.json` lists each recording's tune, verse count and timings.

## Source and licence

The music comes from [The Open Hymnal Project](http://openhymnal.org/) (2014.06 edition). Only scores marked `copyright: public domain` in the Open Hymnal ABC source are used. Open Hymnal states that its public-domain hymns may be freely copied, modified and distributed. The recordings here are synthesised directly from those scores.

## How they're made

`scripts/tunes/` turns the Open Hymnal MIDI files into these MP3s:

1. `match.mjs` matches MHB hymn titles and first lines to Open Hymnal titles. Every pilot hymn was then checked by hand: the hymn's syllables per line must fit the tune's metre.
2. `render.mjs` cuts out the organ introduction and the first verse. Each verse in an Open Hymnal MIDI starts with a tempo marker, which gives the boundaries. The script then plays the introduction once and the verse once per MHB verse, using a small additive organ synth, and encodes the result as 48 kbps mono MP3.

The tune is the one Open Hymnal uses for the text. It may differ from the tune printed in the 1933 Methodist Hymn-Book.

```sh
cd scripts/tunes && npm install
# put OpenHymnal2014.06.abc (as oh.abc) and the unzipped MIDI files (midi/) here
node match.mjs ../../hymns.json && node render.mjs ../../hymns.json ../../audio
```
