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

// Run inside the Scriptable app: a small menu to preview or to set the background.
// For a see-through look: take a screenshot of an empty Home Screen page, crop it in Photos to exactly
// where the widget sits, then choose "Set background from photo" and pick that cropped image.
async function menu() {
  const a = new Alert();
  a.title = "Tramboard";
  a.message = BG_IMAGE ? "The widget uses your background image." : "The widget follows light and dark mode.";
  a.addAction("Preview widget");
  a.addAction("Set background from photo");
  if (BG_IMAGE) a.addDestructiveAction("Remove background");
  a.addCancelAction("Close");
  const choice = await a.presentSheet();
  if (choice === 1) {
    const img = await Photos.fromLibrary();
    fm.writeImage(BG_PATH, img);
    const ok = new Alert();
    ok.title = "Background saved";
    ok.message = "The widget uses it from its next update. Run the script again to preview it.";
    ok.addAction("OK");
    await ok.present();
    return false;
  }
  if (choice === 2 && BG_IMAGE) { fm.remove(BG_PATH); return false; }
  return choice === 0;
}

if (config.runsInWidget) {
  Script.setWidget(await build());
} else if (await menu()) {
  const widget = await build();
  await widget.presentLarge();
}
Script.complete();
