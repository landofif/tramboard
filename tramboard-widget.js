// Tramboard widget for Scriptable (https://scriptable.app)
// Shows the next departures from your stops as an amber VBZ-style board on the Home Screen or Lock Screen.
//
// Setup: paste this into a new Scriptable script, add a Scriptable widget, choose this script,
// and set the widget's Parameter to your stop ids separated by commas, e.g. 8591066,8591323.
// Stop ids are shown in Tramboard under "Stops & settings" → "iPhone widget".
// Optional extras in the parameter: "walk=4" hides departures you can't reach in 4 minutes,
// "lines=33+46" shows only those lines. Example: 8591066,8591323 walk=3 lines=33+46

const DEFAULT_STOPS = ["8591066", "8591323"]; // Zürich Wipkingen, Bahnhof and Zürich, Rosengartenstrasse
const API = "https://transport.opendata.ch/v1";

// Background: your own image if you set one (see "Set background" when you run the script in the app),
// otherwise it follows the phone's light and dark mode.
const fm = FileManager.local();
const BG_PATH = fm.joinPath(fm.documentsDirectory(), "tramboard-background.jpg");
const BG_IMAGE = fm.fileExists(BG_PATH) ? fm.readImage(BG_PATH) : null;
const AMBER = BG_IMAGE ? new Color("#ffb13d") : Color.dynamic(new Color("#9a4f00"), new Color("#ffa31a"));
const AMBER_DIM = BG_IMAGE ? new Color("#ffb13d", 0.8) : Color.dynamic(new Color("#9a4f00", 0.65), new Color("#ffa31a", 0.45));
const GLASS = Color.dynamic(new Color("#eceef0"), new Color("#050505"));
// Over a photo, a soft shadow keeps the amber text readable on light and busy wallpapers.
function legible(t) { if (BG_IMAGE) { t.shadowColor = new Color("#000000", 0.85); t.shadowRadius = 3; t.shadowOffset = new Point(0, 1); } return t; }
// VBZ tram line colours (approximate). Buses and other lines stay amber.
const LINE_COLORS = {
  "2": ["#e3000b", "#ffffff"], "3": ["#00a04b", "#ffffff"], "4": ["#2a2a86", "#ffffff"], "5": ["#8d5b2d", "#ffffff"],
  "6": ["#d99f58", "#000000"], "7": ["#000000", "#ffffff"], "8": ["#a6c93d", "#000000"], "9": ["#4d3b8f", "#ffffff"],
  "10": ["#e4007d", "#ffffff"], "11": ["#00a04b", "#ffffff"], "12": ["#7fcfe3", "#000000"], "13": ["#ffd200", "#000000"],
  "14": ["#0096d6", "#ffffff"], "15": ["#e3000b", "#ffffff"], "17": ["#9c2a5c", "#ffffff"]
};

// ---- settings from the widget parameter ----
const param = String(args.widgetParameter || "").trim();
const tokens = param.split(/[\s,;]+/).filter(Boolean);
const stopIds = tokens.filter(t => /^\d{6,9}$/.test(t));
const opt = key => { const t = tokens.find(t => t.toLowerCase().startsWith(key + "=")); return t ? t.slice(key.length + 1) : ""; };
const WALK = parseInt(opt("walk"), 10) || 0;
const ONLY_LINES = opt("lines").split(/[+|/]+/).filter(Boolean);
const STOPS = stopIds.length ? stopIds : DEFAULT_STOPS;

const family = config.widgetFamily || "large"; // "large" when run inside the app, for the preview
const LAYOUT = {
  small: { stops: 1, rows: 4, dest: false },
  medium: { stops: 2, rows: 2, dest: true },
  large: { stops: 2, rows: 5, dest: true },
  extraLarge: { stops: 2, rows: 6, dest: true },
  accessoryRectangular: { stops: 1, rows: 2, dest: true },
  accessoryInline: { stops: 1, rows: 1, dest: true },
  accessoryCircular: { stops: 1, rows: 1, dest: false }
}[family] || { stops: 1, rows: 3, dest: true };

const shortName = s => String(s || "").replace(/^Zürich,?\s+/, "");
const pad = n => String(n).padStart(2, "0");
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

async function departures(id, count) {
  const req = new Request(`${API}/stationboard?id=${encodeURIComponent(id)}&limit=${Math.max(count * 4, 15)}`);
  req.timeoutInterval = 15;
  const j = await req.loadJSON();
  const now = Date.now();
  const list = (j.stationboard || []).map(e => {
    const planned = e.stop.departureTimestamp * 1000;
    const pg = e.stop.prognosis || e.prognosis || {};
    const real = pg.departure ? Date.parse(pg.departure) : planned + (e.stop.delay || 0) * 60000;
    return { line: String(e.number || e.category), category: e.category, to: e.to, real, delay: Math.round((real - planned) / 60000) };
  })
    .filter(d => !ONLY_LINES.length || ONLY_LINES.includes(d.line))
    .filter(d => (d.real - now) / 60000 >= Math.max(WALK, -0.5))
    .sort((a, b) => a.real - b.real)
    .slice(0, count);
  return { name: j.station ? j.station.name : id, list };
}

function lineBadge(stack, d, size) {
  const box = stack.addStack();
  box.size = new Size(size * 2.3, size * 1.35);
  box.centerAlignContent();
  box.cornerRadius = 2;
  const colors = d.category === "T" && LINE_COLORS[d.line];
  if (colors) box.backgroundColor = new Color(colors[0]);
  const t = box.addText(d.line);
  t.font = Font.heavyMonospacedSystemFont(size);
  t.textColor = colors ? new Color(colors[1]) : AMBER;
  if (!colors) legible(t);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
}

// Whole minutes like the stop displays: 1', 2', 3'. The widget is only as fresh as its last redraw,
// so the board header shows when that was.
function minutesLabel(d) {
  const mins = Math.floor((d.real - Date.now()) / 60000);
  if (mins > 59) return hhmm(new Date(d.real));
  if (mins < 1) return "0'";
  return `${mins}'`;
}

function minutesText(stack, d, size) {
  const t = stack.addText(minutesLabel(d));
  t.font = Font.heavyMonospacedSystemFont(size);
  t.textColor = AMBER;
  legible(t);
  t.rightAlignText();
  t.lineLimit = 1;
}

function addBoard(w, board, rows, size) {
  const head = w.addStack();
  const name = head.addText(shortName(board.name));
  name.font = Font.boldMonospacedSystemFont(size * 0.62);
  name.textColor = AMBER_DIM;
  legible(name);
  name.lineLimit = 1;
  head.addSpacer();
  const stamp = head.addText(hhmm(new Date()));
  stamp.font = Font.boldMonospacedSystemFont(size * 0.62);
  stamp.textColor = AMBER_DIM;
  legible(stamp);
  w.addSpacer(3);
  if (!board.list.length) {
    const t = w.addText("Keine Abfahrten");
    t.font = Font.boldMonospacedSystemFont(size * 0.75);
    t.textColor = AMBER_DIM;
    legible(t);
    return;
  }
  board.list.slice(0, rows).forEach((d, i) => {
    if (i) w.addSpacer(2);
    const row = w.addStack();
    row.centerAlignContent();
    row.spacing = 6;
    lineBadge(row, d, size);
    if (LAYOUT.dest) {
      const dest = row.addText(shortName(d.to));
      dest.font = Font.heavyMonospacedSystemFont(size);
      dest.textColor = AMBER;
      legible(dest);
      dest.lineLimit = 1;
      dest.minimumScaleFactor = 0.75;
    }
    row.addSpacer();
    if (d.delay >= 3) { const late = row.addText(">"); late.font = Font.heavyMonospacedSystemFont(size); late.textColor = AMBER; legible(late); }
    const clock = row.addStack();
    clock.size = new Size(size * 3.4, 0);
    minutesText(clock, d, size);
  });
}

function addLockScreen(w, board) {
  const d = board.list[0];
  if (family === "accessoryInline" || family === "accessoryCircular") {
    w.addText(d ? `${d.line} ${hhmm(new Date(d.real))}` : "–");
    return;
  }
  const title = w.addText(shortName(board.name));
  title.font = Font.boldSystemFont(11);
  board.list.slice(0, 2).forEach(x => {
    const row = w.addStack();
    const t = row.addText(`${x.line} ${shortName(x.to)}`);
    t.font = Font.semiboldSystemFont(13);
    t.lineLimit = 1;
    row.addSpacer();
    const time = row.addText(minutesLabel(x));
    time.font = Font.semiboldMonospacedSystemFont(13);
    time.rightAlignText();
  });
}

async function build() {
  const w = new ListWidget();
  const lock = family.startsWith("accessory");
  const stops = STOPS.slice(0, LAYOUT.stops);
  let boards;
  try {
    boards = await Promise.all(stops.map(id => departures(id, LAYOUT.rows)));
  } catch (e) {
    boards = null;
  }
  // Ask for a redraw at the next full minute so the minutes tick over. iOS treats this as a wish
  // and may wait longer, which is why the header shows the time of the last update.
  const nextMinute = new Date(); nextMinute.setSeconds(0, 0); nextMinute.setMinutes(nextMinute.getMinutes() + 1);
  w.refreshAfterDate = nextMinute;
  w.url = "https://landofif.github.io/tramboard/";

  if (lock) {
    if (boards) addLockScreen(w, boards[0]);
    else w.addText("Offline");
    return w;
  }

  if (BG_IMAGE) w.backgroundImage = BG_IMAGE;
  else w.backgroundColor = GLASS;
  w.setPadding(12, 12, 12, 12);
  const size = family === "small" ? 15 : family === "medium" ? 14 : 16;
  if (!boards) {
    const t = w.addText("Keine Verbindung");
    t.font = Font.heavyMonospacedSystemFont(size);
    t.textColor = AMBER;
    return w;
  }
  boards.forEach((b, i) => {
    if (i) w.addSpacer(family === "medium" ? 6 : 10);
    addBoard(w, b, LAYOUT.rows, size);
  });
  w.addSpacer();
  return w;
}

// Widget positions on the Home Screen, in screenshot pixels, keyed by screenshot height.
// These are the widely used values from the Scriptable community's transparent-widget scripts.
// Home Screens with large icons or a different layout may be off by a little; the manual crop always works.
const HOME_LAYOUTS = {
  2532: { small: 474, medium: 1014, large: 1062, left: 78, right: 618, top: 231, middle: 819, bottom: 1407 }, // iPhone 12, 12 Pro, 13, 13 Pro, 14
  2778: { small: 510, medium: 1092, large: 1146, left: 96, right: 678, top: 246, middle: 882, bottom: 1518 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  2340: { small: 436, medium: 936, large: 980, left: 72, right: 570, top: 212, middle: 756, bottom: 1300 }, // 12 mini, 13 mini
  2556: { small: 474, medium: 1017, large: 1062, left: 82, right: 622, top: 270, middle: 858, bottom: 1446 }, // 14 Pro, 15, 15 Pro
  2796: { small: 510, medium: 1092, large: 1146, left: 99, right: 681, top: 282, middle: 918, bottom: 1554 } // 14 Pro Max, 15 Plus, 15 Pro Max
};

async function choose(title, message, options) {
  const a = new Alert();
  a.title = title;
  if (message) a.message = message;
  options.forEach(o => a.addAction(o));
  a.addCancelAction("Cancel");
  const i = await a.presentSheet();
  return i < 0 ? null : options[i];
}

async function notify(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction("OK");
  await a.present();
}

function crop(img, x, y, w, h) {
  const d = new DrawContext();
  d.size = new Size(w, h);
  d.opaque = true;
  d.drawImageAtPoint(img, new Point(-x, -y));
  return d.getImage();
}

// Cuts the piece of a Home Screen screenshot that sits behind the widget, so the widget looks see-through.
async function backgroundFromScreenshot() {
  await notify("Screenshot first",
    "Go to an empty Home Screen page (enter jiggle mode and swipe to the last page), take a screenshot, then come back and pick it.");
  const img = await Photos.fromLibrary();
  const L = HOME_LAYOUTS[Math.round(img.size.height)];
  if (!L) {
    await notify("Unknown screen size",
      "This iPhone's layout isn't in the list yet. Crop the screenshot in Photos to where the widget sits and use \"Set background from cropped photo\" instead.");
    return;
  }
  const size = await choose("Widget size", "Which size is the widget?", ["Small", "Medium", "Large"]);
  if (!size) return;
  const positions = {
    Small: ["Top left", "Top right", "Middle left", "Middle right", "Bottom left", "Bottom right"],
    Medium: ["Top", "Middle", "Bottom"],
    Large: ["Top", "Bottom"]
  }[size];
  const pos = await choose("Widget position", "Where on the Home Screen is it?", positions);
  if (!pos) return;
  const row = pos.startsWith("Top") ? "top" : pos.startsWith("Middle") ? "middle" : "bottom";
  let x = L.left, y = L[row], w = L.medium, h = L.small;
  if (size === "Small") { w = L.small; x = pos.endsWith("right") ? L.right : L.left; }
  if (size === "Large") { h = L.large; y = pos === "Top" ? L.top : L.middle; }
  fm.writeImage(BG_PATH, crop(img, x, y, w, h));
  await notify("Background saved", "The widget uses it from its next update. If it looks shifted, use the manual crop instead.");
}

// Run inside the Scriptable app: a small menu to preview or to set the background.
async function menu() {
  const options = ["Preview widget", "Make see-through (from screenshot)", "Set background from cropped photo"];
  if (BG_IMAGE) options.push("Remove background");
  const choice = await choose("Tramboard", BG_IMAGE ? "The widget uses your background image." : "The widget follows light and dark mode.", options);
  if (choice === "Make see-through (from screenshot)") { await backgroundFromScreenshot(); return false; }
  if (choice === "Set background from cropped photo") {
    fm.writeImage(BG_PATH, await Photos.fromLibrary());
    await notify("Background saved", "The widget uses it from its next update.");
    return false;
  }
  if (choice === "Remove background") { fm.remove(BG_PATH); return false; }
  return choice === "Preview widget";
}

if (config.runsInWidget) {
  Script.setWidget(await build());
} else if (await menu()) {
  const widget = await build();
  await widget.presentLarge();
}
Script.complete();
