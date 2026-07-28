/* Bundle the multi-page marketing site into one self-contained HTML file.
   Inlines styles.css + app.js, folds docs/privacy/security into the same
   document as switchable views, and rewrites their links to hash routes.
   Output: dist/find-anything-site.html (standalone) and
           dist/artifact-body.html (no doctype/html/head/body wrapper). */
import { readFile, writeFile, mkdir } from "node:fs/promises";

const here = new URL("./", import.meta.url);
const read = (f) => readFile(new URL(f, here), "utf8");

const [index, docs, privacy, security, css, js] = await Promise.all(
  ["index.html", "docs.html", "privacy.html", "security.html", "styles.css", "app.js"].map(read),
);

/* Pull the <main> block out of a subpage. */
function mainOf(html) {
  const m = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (!m) throw new Error("no <main> found");
  return m[1];
}

const views = [
  { id: "page-docs", file: "docs.html", body: mainOf(docs) },
  { id: "page-privacy", file: "privacy.html", body: mainOf(privacy) },
  { id: "page-security", file: "security.html", body: mainOf(security) },
];

/* Router: swap between the home view and the folded-in subpages. */
const router = `
/* ---------- Single-file view router ---------- */
(function () {
  var views = ${JSON.stringify(views.map((v) => v.id))};
  var home = document.getElementById("main");
  function show(id) {
    var isHome = !id || id === "home";
    if (home) home.hidden = !isHome;
    views.forEach(function (v) {
      var el = document.getElementById(v);
      if (el) el.hidden = isHome || v !== id;
    });
    window.scrollTo(0, 0);
  }
  function fromHash() {
    var h = (location.hash || "").replace(/^#/, "");
    if (views.indexOf(h) !== -1) show(h);
    else if (!h) show("home");
    else {
      show("home");
      var t = document.getElementById(h);
      if (t) t.scrollIntoView();
    }
  }
  window.addEventListener("hashchange", fromHash);
  fromHash();
})();
`;

const viewMarkup = views
  .map((v) => `<div class="subview" id="${v.id}" hidden>${v.body}</div>`)
  .join("\n");

/* Rewrite cross-page links to hash routes. */
function rewriteLinks(html) {
  return html
    .replace(/href="docs\.html"/g, 'href="#page-docs"')
    .replace(/href="docs\.html#api"/g, 'href="#page-docs"')
    .replace(/href="privacy\.html"/g, 'href="#page-privacy"')
    .replace(/href="security\.html"/g, 'href="#page-security"')
    .replace(/href="index\.html"/g, 'href="#home"');
}

/* Body content of index, minus the stylesheet link and script tag. */
let body = index
  .replace(/[\s\S]*?<body[^>]*>/i, "")
  .replace(/<\/body>[\s\S]*$/i, "")
  .replace(/<script[^>]*src="app\.js"[^>]*><\/script>/i, "");

/* Insert the folded-in views directly after </main> so they sit above the
   footer; appending at the end of <body> would render them below it. */
if (!/<\/main>/i.test(body)) throw new Error("expected </main> in index.html");
body = rewriteLinks(body).replace(/<\/main>/i, "</main>\n" + rewriteLinks(viewMarkup));

const title = (index.match(/<title>([\s\S]*?)<\/title>/i) || [, "Find Anything"])[1];
const desc = (index.match(/<meta name="description" content="([^"]*)"/i) || [, ""])[1];
const favicon = (index.match(/<link rel="icon"[^>]*>/i) || [""])[0];
// Canonical/OG/Twitter/waitlist-endpoint tags marked in index.html's head.
const metaBlock = (index.match(/<!-- meta:start[\s\S]*?meta:end -->/i) || [""])[0];

const head = `<title>${title}</title>
<meta name="description" content="${desc}" />
<meta name="color-scheme" content="dark light" />
${metaBlock}
${favicon}
<style>
${css}
.subview { display: block; }
[hidden] { display: none !important; }
</style>`;

const scripts = `<script>\n${js}\n${router}\n</script>`;

const artifactBody = `${head}\n${body}\n${scripts}\n`;

const standalone = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${head}
</head>
<body>
${body}
${scripts}
</body>
</html>
`;

await mkdir(new URL("./dist/", here), { recursive: true });
await writeFile(new URL("./dist/find-anything-site.html", here), standalone);
await writeFile(new URL("./dist/artifact-body.html", here), artifactBody);

console.log("standalone:", standalone.length, "bytes");
console.log("artifact  :", artifactBody.length, "bytes");
console.log("views folded in:", views.map((v) => v.id).join(", "));
