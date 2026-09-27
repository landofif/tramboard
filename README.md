# Tramboard

A departure board for Swiss trams and buses, styled after the amber LED displays at VBZ stops in Zürich. Inspired by [Tramli](https://tramli.com).

- Live departures from [transport.opendata.ch](https://transport.opendata.ch) (no API key needed)
- Several stops, each with its own line, destination and transport-type filters
- Walking time per stop: hides departures you can't reach and shows when to leave
- Full-screen desk mode that keeps the screen awake
- Settings are saved in your browser

It is a single static `index.html`. An open tab reloads itself when `version.json` changes, so bump `build` in both files when publishing a new version.
