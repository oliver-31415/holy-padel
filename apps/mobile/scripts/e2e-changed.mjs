// Runs only the Playwright specs a change can affect, so local runs stay quick.
// Each changed file is followed up the import graph (apps/mobile/src, e2e/,
// packages/*/src) to the Expo Router pages and specs that use it. Anything app-wide,
// or anything the graph cannot place, falls back to the full suite.
//
//   pnpm --filter @holy-padel/mobile e2e:changed                  # changed vs main + working tree
//   pnpm --filter @holy-padel/mobile e2e:changed --plan           # explain the selection, run nothing
//   pnpm --filter @holy-padel/mobile e2e:changed --plan --files='src/lib/rallies.ts,src/app/(tabs)/stats.tsx'
//   pnpm --filter @holy-padel/mobile e2e:changed --full           # force the whole suite
//   pnpm --filter @holy-padel/mobile e2e:changed --base=origin/main -- --grep "stats"
//
// Other args (`--grep`, `--headed`, ...) pass through to `playwright test`.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const mobileDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(mobileDir, "../..");
const MOBILE = "apps/mobile/";
const PACKAGES = "packages/";
const APP_DIR = "src/app/";
const E2E_DIR = "e2e/";

// Mobile paths that never reach the web build.
const MOBILE_IGNORED = ["test/", ".maestro/", "targets/", "plugins/", "scripts/"];
// Repo paths outside the mobile app and packages that cannot change the web build.
const REPO_IGNORED = [
  "apps/watch-wear/",
  "packages/scoring-swift/",
  "packages/scoring-kotlin/",
  "docs/",
  "design/",
  ".github/",
  ".claude/",
  ".codex/",
];
// Modules every screen depends on: a change runs the whole suite.
const APP_WIDE = ["src/theme/", "src/tamagui.config.", "src/db/provider.", "src/app/_layout."];

const SOURCE = /\.[jt]sx?$/u;
// Platform-only variants: the web bundle never resolves these.
const NON_WEB_VARIANT = /\.(?:native|ios|android)\.[jt]sx?$/u;
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

// Clicks no goto or URL assertion reveals: NEW MATCH opens /new-match, START MATCH replaces with /live/.
const NEW_MATCH_CLICK = ["/new-match", "/live/"];
// Routes a helper drives by clicking. Its callees are followed separately (saveLiveMatchIfAsked via startNewMatch).
const HELPER_CLICKS = {
  startNewMatch: NEW_MATCH_CLICK,
  saveLiveMatchIfAsked: ["/live/"],
};
// Clicks a spec makes itself. Finishing a match stays on /live/ (FinishedMatch makes no match-page
// navigation), so /match/ comes only from a goto, a URL assertion, or a Matches-tab row a spec clicks.
const NAVIGATES = {
  "defaults.spec.ts": [...NEW_MATCH_CLICK, "/profile", "/edit-defaults"],
  "edge-cases.spec.ts": [...NEW_MATCH_CLICK, "/matches", "/profile"],
  "edit-profile.spec.ts": ["/edit-profile", "/profile"],
  "full-match.spec.ts": ["/matches", "/live/"],
  "home.spec.ts": ["/matches", "/profile", "/live/"],
  "journeys.spec.ts": [...NEW_MATCH_CLICK, "/matches", "/profile"],
  "matches.spec.ts": ["/live/", "/new-match"],
  "nav-exits.spec.ts": NEW_MATCH_CLICK,
  "navigation.spec.ts": ["/matches", "/profile", "/stats", "/live/"],
  "new-match.spec.ts": NEW_MATCH_CLICK,
  "overview.spec.ts": ["/matches", "/profile"],
  "player.spec.ts": ["/player/", "/edit-player/", "/stats"],
  "presets.spec.ts": NEW_MATCH_CLICK,
  "profile.spec.ts": ["/edit-profile", "/data"],
  "squash.spec.ts": NEW_MATCH_CLICK,
  "stats.spec.ts": ["/matches"],
};

const VALUE_FLAG = /^--(?:base|files)=/u;
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const flagValue = (name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = flagValue("base") ?? "main";
const filesArg = flagValue("files");
const plan = args.includes("--plan");
const forceFull = args.includes("--full");
const passthrough = args.filter(
  (arg) => !(["--plan", "--full"].includes(arg) || VALUE_FLAG.test(arg)),
);

function git(...gitArgs) {
  const result = spawnSync("git", gitArgs, { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.split("\n").filter(Boolean) : null;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const isFile = (file) => existsSync(file) && statSync(file).isFile();
const toPosix = (file) => file.split(path.sep).join("/");
// Expo's web bundle prefers `foo.web.tsx`, so both spellings share one graph node.
const WEB_SUFFIX = /\.web(?=\.[jt]sx?$)/u;
const stripWeb = (rel) => rel.replace(WEB_SUFFIX, "");

// Workspace packages, keyed by package name (`@holy-padel/scoring`).
const packages = readdirSync(path.join(repoRoot, PACKAGES), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const rel = `${PACKAGES}${entry.name}`;
    const manifest = path.join(repoRoot, rel, "package.json");
    return existsSync(manifest)
      ? { rel, name: JSON.parse(readFileSync(manifest, "utf8")).name }
      : null;
  })
  .filter((pkg) => pkg !== null);

// A file's graph node: a package collapses to one node, app files keep their path.
function nodeKeyOf(abs) {
  const pkg = packages.find((p) => abs.startsWith(path.join(repoRoot, p.rel) + path.sep));
  if (pkg !== undefined) {
    return `pkg:${pkg.name}`;
  }
  return stripWeb(toPosix(path.relative(mobileDir, abs)));
}

const JS_SUFFIX = /\.jsx?$/u;
// Finds the file an import means on disk: exact path, `.js` written for `.ts`, extension, or index.
function resolveFile(target) {
  const stem = target.replace(JS_SUFFIX, "");
  const withExtensions = [stem, path.join(target, "index")].flatMap((root) =>
    EXTENSIONS.flatMap((ext) => [`${root}${ext}`, `${root}.web${ext}`]),
  );
  return [target, ...withExtensions].find(isFile) ?? null;
}

function resolveSpecifier(specifier, fromAbs) {
  if (specifier.startsWith("@holy-padel/")) {
    return `pkg:${specifier.split("/").slice(0, 2).join("/")}`;
  }
  let target;
  if (specifier.startsWith("@/")) {
    target = path.join(mobileDir, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    target = path.resolve(path.dirname(fromAbs), specifier);
  } else {
    return null;
  }
  const file = resolveFile(target);
  return file === null ? null : nodeKeyOf(file);
}

const IMPORT_PATTERNS = [
  /\bfrom\s*["'](?<specifier>[^"'\n]+)["']/gu, // import x from "y", export * from "y"
  /\bimport\s*["'](?<specifier>[^"'\n]+)["']/gu, // import "y"
  /\bimport\s*\(\s*["'](?<specifier>[^"'\n]+)["']\s*\)/gu, // import("y")
  /\brequire\(\s*["'](?<specifier>[^"'\n]+)["']\s*\)/gu,
];
const importSpecifiers = (text) =>
  IMPORT_PATTERNS.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => match.groups.specifier),
  );

const scanned = [
  path.join(mobileDir, "src"),
  path.join(mobileDir, "e2e"),
  ...packages.map((p) => path.join(repoRoot, p.rel, "src")),
]
  .filter((dir) => existsSync(dir))
  .flatMap((dir) => walk(dir))
  .filter((file) => SOURCE.test(file) && !NON_WEB_VARIANT.test(file) && !file.endsWith(".d.ts"));

// importers.get(node) = the nodes that import it.
const importers = new Map();
for (const file of scanned) {
  const key = nodeKeyOf(file);
  for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
    const target = resolveSpecifier(specifier, file);
    if (target !== null && target !== key) {
      if (!importers.has(target)) {
        importers.set(target, new Set());
      }
      importers.get(target).add(key);
    }
  }
}

// Breadth-first walk up the graph: every node that transitively imports `start`.
// Maps each reached node to the node it was reached from (null for `start`).
function reach(start) {
  const parent = new Map([[start, null]]);
  const queue = [start];
  for (const node of queue) {
    for (const importer of importers.get(node) ?? []) {
      if (!parent.has(importer)) {
        parent.set(importer, node);
        queue.push(importer);
      }
    }
  }
  return parent;
}

// The import chain from `start` down to `node`, e.g. [lib/rallies.ts, rallies-card.tsx, match/[id].tsx].
function chainTo(parent, node) {
  const chain = [];
  for (let cur = node; cur !== null; cur = parent.get(cur)) {
    chain.push(cur);
  }
  return chain.reverse();
}

// Expo Router: `(group)` segments drop out, `index` is the folder's URL, `[id]` stays a dynamic segment.
function routeOf(rel) {
  const segments = rel
    .replace(SOURCE, "")
    .split("/")
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
  if (segments.at(-1) === "index") {
    segments.pop();
  }
  return `/${segments.join("/")}`;
}

// What a file under src/app is: a page at a URL, a layout wrapping its folder, or a special `+` file.
function appFileInfo(key) {
  const rel = key.slice(APP_DIR.length);
  const name = path.posix.basename(rel);
  if (name.startsWith("+")) {
    return { kind: "special" };
  }
  if (name.startsWith("_layout")) {
    return { kind: "layout", dir: path.posix.dirname(rel) };
  }
  return { kind: "page", url: routeOf(rel) };
}

const pageKeys = [...new Set(scanned.map(nodeKeyOf))].filter(
  (key) => key.startsWith(APP_DIR) && appFileInfo(key).kind === "page",
);

// URL literals a file navigates to: goto(...), waitForURL/toHaveURL with a string, or toHaveURL(/regex/).
// An empty literal (an unreadable template) covers every page.
const URL_CALL = /\b(?:goto|waitForURL|toHaveURL)\(\s*(?<quote>["'`])(?<url>[^"'`]*)\k<quote>/gu;
const URL_REGEX = /toHaveURL\(\s*\/(?<pattern>(?:\\.|[^/\\])+)\/[a-z]*\s*\)/gu;
const QUERY_OR_HASH = /[?#]/u;
const ESCAPED_SLASH = /\\\//gu;
const REGEX_META = /[\\()[\]{}?*+|^$.]/u;
function urlEntries(text, source) {
  const direct = [...text.matchAll(URL_CALL)].map(
    (match) => match.groups.url.split("${")[0].split(QUERY_OR_HASH)[0],
  );
  const asserted = [...text.matchAll(URL_REGEX)].map(
    (match) => match.groups.pattern.replace(ESCAPED_SLASH, "/").split(REGEX_META)[0],
  );
  return [...direct, ...asserted].map((literal) => ({ literal, source }));
}

const specNames = readdirSync(path.join(mobileDir, E2E_DIR))
  .filter((name) => name.endsWith(".spec.ts"))
  .sort();
// Each top-level declaration in helpers.ts, keyed by name, with its text up to the next declaration.
const helpersText = readFileSync(path.join(mobileDir, E2E_DIR, "helpers.ts"), "utf8");
const DECLARATION =
  /^(?:export\s+)?(?:async\s+)?(?<kind>function|const|type|interface)\s+(?<name>\w+)/gmu;
const declarations = [...helpersText.matchAll(DECLARATION)];
const helperBodies = new Map();
declarations.forEach((declaration, index) => {
  if (declaration.groups.kind === "function" || declaration.groups.kind === "const") {
    const end = declarations[index + 1]?.index ?? helpersText.length;
    helperBodies.set(declaration.groups.name, helpersText.slice(declaration.index, end));
  }
});
const helperNames = [...helperBodies.keys()];
const callsHelper = (text, name) => new RegExp(`\\b${name}\\s*\\(`, "u").test(text);

const HELPER_IMPORT =
  /import\s+(?:type\s+)?\{(?<names>[^}]*)\}\s*from\s*["']\.\/helpers(?:\.ts)?["']/gu;
const TYPE_PREFIX = /^type\s+/u;
// The helpers a spec imports from ./helpers.ts (`import type` lines count too, but cannot call).
const importedHelpers = (text) =>
  new Set(
    [...text.matchAll(HELPER_IMPORT)].flatMap((match) =>
      match.groups.names.split(",").map((name) => name.trim().replace(TYPE_PREFIX, "")),
    ),
  );

// The routes a helper reaches: its own goto and click flow, then those of the helpers it calls.
function helperRoutes(name, chain, seen = new Set()) {
  if (seen.has(name)) {
    return [];
  }
  seen.add(name);
  const body = helperBodies.get(name);
  const source = `helper ${chain.join(" -> ")}`;
  return [
    ...urlEntries(body, source),
    ...(HELPER_CLICKS[name] ?? []).map((literal) => ({
      literal,
      source: `${source} (click flow)`,
    })),
    ...helperNames
      .filter((callee) => callee !== name && callsHelper(body, callee))
      .flatMap((callee) => helperRoutes(callee, [...chain, callee], seen)),
  ];
}

// Which URL literals each spec reaches: its own goto and URL assertions, the helpers it calls
// (and what they call), and the clicks in NAVIGATES.
const coverage = new Map(
  specNames.map((name) => {
    const text = readFileSync(path.join(mobileDir, E2E_DIR, name), "utf8");
    const imported = importedHelpers(text);
    const called = helperNames.filter(
      (helper) => imported.has(helper) && callsHelper(text, helper),
    );
    const entries = [
      ...urlEntries(text, "goto"),
      ...called.flatMap((helper) => helperRoutes(helper, [helper])),
      ...(NAVIGATES[name] ?? []).map((literal) => ({ literal, source: "navigation" })),
    ];
    return [name, entries];
  }),
);

// Static pages match exactly; dynamic pages (`/match/[id]`) match their static prefix.
function reaches(literal, url) {
  if (literal === "") {
    return true;
  }
  const dynamic = url.indexOf("[");
  return dynamic === -1 ? literal === url : literal.startsWith(url.slice(0, dynamic));
}

// A spec named after the page's first segment (`stats.spec.ts`, `live-scoring.spec.ts` for `/live/[id]`).
function namedAfter(spec, url) {
  const stem = url.split("/").find(Boolean);
  return (
    stem !== undefined &&
    !stem.startsWith("[") &&
    (spec === `${stem}.spec.ts` || spec.startsWith(`${stem}-`))
  );
}

function specsForPage(url) {
  return specNames.flatMap((spec) => {
    const hit = coverage.get(spec).find((entry) => reaches(entry.literal, url));
    if (hit !== undefined) {
      return [{ spec: `${E2E_DIR}${spec}`, why: `${hit.source} ${hit.literal || "*"}` }];
    }
    return namedAfter(spec, url)
      ? [{ spec: `${E2E_DIR}${spec}`, why: "named after the page" }]
      : [];
  });
}

// Explains one graph node: which specs it selects, or why it needs the full suite.
function explain(key) {
  const out = { full: [], notes: [], picks: [] };
  const visited = reach(key);
  let reachedApp = false;
  const addPage = (url, via) => {
    const specs = specsForPage(url);
    if (specs.length === 0) {
      out.notes.push(`page ${url} has no spec (${via})`);
    }
    for (const { spec, why } of specs) {
      out.picks.push({ spec, reason: `${via} => ${url} [${why}]` });
    }
  };
  for (const node of visited.keys()) {
    const via = chainTo(visited, node).join(" -> ");
    if (node.startsWith(E2E_DIR) && node.endsWith(".spec.ts")) {
      reachedApp = true;
      out.picks.push({ spec: node, reason: node === key ? "changed spec" : via });
    } else if (node.startsWith(APP_DIR)) {
      reachedApp = true;
      const info = appFileInfo(node);
      if (info.kind === "special") {
        out.full.push(`${via} (Expo Router special file ${node})`);
      } else if (info.kind === "layout" && info.dir === ".") {
        out.full.push(`${via} (root layout ${node} wraps every route)`);
      } else if (info.kind === "layout") {
        for (const page of pageKeys.filter((p) => p.startsWith(`${APP_DIR}${info.dir}/`))) {
          addPage(appFileInfo(page).url, `${via} (layout ${node} wraps it)`);
        }
      } else {
        addPage(info.url, via);
      }
    }
  }
  if (!reachedApp) {
    if (key.startsWith("pkg:")) {
      out.notes.push(`${key} is not imported by the mobile app`);
    } else {
      out.full.push(`no route or spec imports ${key}`);
    }
  }
  return out;
}

const PACKAGE_CONFIG = /^(?:package\.json|tsconfig[^/]*)$/u;
const TEST_FILE = /\.test\.[jt]sx?$/u;
const SPEC_FILE = /^e2e\/[^/]+\.spec\.ts$/u;
const NATIVE_PATH = /\/(?:android|ios)\//u;
// Classifies one repo-relative changed file as ignored, full-suite, or a graph node to explain.
function classify(file) {
  if (file.endsWith(".md")) {
    return { ignore: "docs" };
  }
  if (REPO_IGNORED.some((prefix) => file.startsWith(prefix))) {
    return { ignore: "outside the web build" };
  }
  if (file.startsWith(PACKAGES)) {
    const pkg = packages.find((p) => file.startsWith(`${p.rel}/`));
    const rest = file.slice(
      pkg === undefined ? file.indexOf("/", PACKAGES.length) + 1 : pkg.rel.length + 1,
    );
    if (pkg === undefined) {
      return { full: `unknown package file ${file}` };
    }
    if (PACKAGE_CONFIG.test(rest)) {
      return { full: `package config ${file}` };
    }
    if (rest.startsWith("src/") && !TEST_FILE.test(rest)) {
      return { key: `pkg:${pkg.name}` };
    }
    return { ignore: "package tests or docs" };
  }
  if (!file.startsWith(MOBILE)) {
    return { full: `repo config ${file}` };
  }
  const rel = file.slice(MOBILE.length);
  if (rel.startsWith(E2E_DIR)) {
    return SPEC_FILE.test(rel) ? { key: rel } : { full: `shared e2e file ${rel}` };
  }
  if (MOBILE_IGNORED.some((prefix) => rel.startsWith(prefix))) {
    return { ignore: "native or tooling dir" };
  }
  if (rel.startsWith("modules/")) {
    // Native code never reaches the web bundle; module JS is imported by bare name, so it runs full.
    return NATIVE_PATH.test(rel) ? { ignore: "native module code" } : { full: rel };
  }
  if (rel.startsWith("src/")) {
    if (NON_WEB_VARIANT.test(rel)) {
      return { ignore: "native-only variant" };
    }
    if (APP_WIDE.some((prefix) => rel.startsWith(prefix))) {
      return { full: `app-wide module ${rel}` };
    }
    return SOURCE.test(rel) ? { key: stripWeb(rel) } : { full: `non-code file ${rel}` };
  }
  return { full: rel };
}

function changedFiles() {
  const committed = git("diff", "--name-only", "--no-renames", `${base}...HEAD`);
  const working = git("diff", "--name-only", "--no-renames", "HEAD") ?? [];
  const untracked = git("ls-files", "--others", "--exclude-standard") ?? [];
  return {
    files: [...new Set([...(committed ?? []), ...working, ...untracked])],
    baseMissing: committed === null,
  };
}

// `--files` paths are relative to the current directory (apps/mobile under pnpm --filter).
const normalise = (file) =>
  toPosix(path.relative(repoRoot, path.resolve(process.cwd(), file.trim())));

const fromFlag = filesArg === undefined ? null : filesArg.split(",").map(normalise).filter(Boolean);
const { files, baseMissing } =
  fromFlag === null ? changedFiles() : { files: fromFlag, baseMissing: false };

const fullReasons = [];
if (forceFull) {
  fullReasons.push("--full");
}
if (baseMissing) {
  fullReasons.push(`base "${base}" not found`);
}
const selections = new Map();
const report = [];
for (const file of files) {
  const verdict = classify(file);
  const lines = [];
  if (verdict.ignore !== undefined) {
    lines.push(`ignored (${verdict.ignore})`);
  } else if (verdict.full === undefined) {
    const out = explain(verdict.key);
    for (const reason of out.full) {
      fullReasons.push(reason);
      lines.push(`FULL: ${reason}`);
    }
    for (const note of out.notes) {
      lines.push(`note: ${note}`);
    }
    for (const { spec, reason } of out.picks) {
      lines.push(`${spec}  <- ${reason}`);
      selections.set(spec, [...(selections.get(spec) ?? []), reason]);
    }
    if (lines.length === 0) {
      lines.push("no e2e coverage");
    }
  } else {
    fullReasons.push(verdict.full);
    lines.push(`FULL: ${verdict.full}`);
  }
  report.push({ file, lines });
}

const selected = [...selections.keys()].sort();
let mode = "none";
if (selected.length > 0) {
  mode = "selected";
}
if (fullReasons.length > 0) {
  mode = "full";
}

function say(line) {
  process.stdout.write(`${line}\n`);
}

say(`e2e:changed base=${base}, ${files.length} changed file(s)`);
for (const { file, lines } of report) {
  say(file);
  for (const line of lines) {
    say(`  ${line}`);
  }
}
if (mode === "full") {
  say(`running the full suite: ${[...new Set(fullReasons)].join("; ")}`);
} else if (mode === "selected") {
  say(`running ${selected.length} spec(s): ${selected.join(", ")}`);
} else {
  say("no e2e-relevant changes; nothing to run");
}

if (plan || mode === "none") {
  process.exit(0);
}

const runArgs = [
  "exec",
  "playwright",
  "test",
  ...(mode === "selected" ? selected : []),
  ...passthrough,
];
const child = spawn("pnpm", runArgs, { cwd: mobileDir, stdio: "inherit" });
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
