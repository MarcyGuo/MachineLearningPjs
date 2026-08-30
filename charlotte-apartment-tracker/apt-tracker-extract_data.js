// Usage: node extract_data.js <path-to-artifact-html> <path-to-output-json>
// Loads the artifact's HTML in a headless jsdom sandbox, lets its boot() script run,
// and dumps window.__APP_DATA__ (the current live state, including Marcy's self-edits)
// as JSON. Handles both the "wrapped" served form (starts with <!doctype html>) and the
// "raw content" form the Artifact tool stores before wrapping (starts with <title>/<style>).
const { JSDOM } = require("jsdom");
const fs = require("fs");

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node extract_data.js <in.html> <out.json>");
  process.exit(1);
}

let html = fs.readFileSync(inPath, "utf8");
if (!/^\s*<!doctype html>/i.test(html)) {
  // unwrapped "raw content" form -- wrap it minimally so jsdom has a full document
  html = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>" + html + "</body></html>";
}

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://example.com/", pretendToBeVisual: true });
  const { window } = dom;
  window.claude = { use: async () => null }; // no real save capability needed for extraction
  window.sessionStorage = (() => {
    let s = {};
    return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => (s[k] = String(v)), removeItem: (k) => delete s[k] };
  })();

  // give the inline <script> time to run boot() and set window.__APP_DATA__
  let waited = 0;
  while (!window.__APP_DATA__ && waited < 2000) {
    await new Promise((r) => setTimeout(r, 50));
    waited += 50;
  }

  if (!window.__APP_DATA__) {
    console.error("FAILED: window.__APP_DATA__ was never set -- the page's boot() script did not run as expected.");
    process.exit(2);
  }

  fs.writeFileSync(outPath, JSON.stringify(window.__APP_DATA__));
  console.error("OK: extracted " + window.__APP_DATA__.properties.length + " properties to " + outPath);
})().catch((e) => {
  console.error("EXCEPTION:", e);
  process.exit(3);
});
