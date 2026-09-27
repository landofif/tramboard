# Tramboard

A departure board for Swiss trams and buses, styled after the amber LED displays at VBZ stops in Zürich. Inspired by [Tramli](https://tramli.com).

Live at **https://landofif.github.io/tramboard/**

- Live departures from [transport.opendata.ch](https://transport.opendata.ch) (no API key needed)
- Several stops, each with its own line, destination and transport-type filters
- "Use my location": add the closest stops, or a board that always follows where you are
- Walking time per stop: hides departures you can't reach and shows when to leave
- Scrolling info line for cancellations and delays of 5 minutes or more
- Full-screen desk mode that keeps the screen awake and dims at night
- Installable app (Add to Home Screen) that opens instantly, even offline
- Copy your settings to another device with a link or QR code

## iPhone widget

`tramboard-widget.js` is a widget for the free [Scriptable](https://scriptable.app) app.

1. Install Scriptable, create a new script, and paste in `tramboard-widget.js` (the site's settings have a **Copy widget script** button).
2. Add a Scriptable widget to your Home Screen or Lock Screen and choose the script.
3. Set the widget's Parameter to your stop ids, for example `8591066,8591323`. Optional: `walk=3` and `lines=33+46`.

The widget follows light and dark mode. To make it blend into your wallpaper, screenshot an empty Home Screen page, crop it in Photos to where the widget sits, run the script in Scriptable and choose **Set background from photo**.

Times are shown in whole minutes, like the stop displays. The widget asks iOS to redraw every minute, but iOS decides how often widgets actually refresh, so each board shows the time of its last update.

## Publishing

It's a static site. An open tab reloads itself when `version.json` changes, so bump `build` in `version.json` and `BUILD` in `index.html` together.
