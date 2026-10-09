#!/usr/bin/env node
/**
 * Documentation quality gate (`pnpm validate:docs`). Node built-ins only, no install needed.
 *
 * Checks:
 * A. Local Markdown links in every `.md` file resolve (relative to the file; `/x` = repo root), and `#anchors` into Markdown
 *    files match a heading (GitHub slug rules) or an explicit `<a id|name>`. Fenced code, inline code, HTML comments and
 *    external URLs are ignored.
 * B. The canonical documentation files exist.
 * C. `CLAUDE.md` and `AGENTS.md` are identical after line-ending normalization.
 * D. In current technical docs (`CURRENT_DOC_SCOPE`), every inline-code token that is written as a repo-relative path
 *    (starts with one of `CODE_PATH_ROOTS`) exists. Tokens with glob or placeholder characters are skipped; a `:line`
 *    suffix is allowed. Event names, commands and snippets in backticks are never treated as paths.
 * E. Index integrity: every `*.instruction.md` in a module folder is linked from that folder's `README.md`, every testcase
 *    checklist is linked from `testcase/README.md`, every module folder is linked from the technical index, and the
 *    Documentation Hub links every canonical entry point.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TECH = 'project-document/monopoly-websockets';

export const CANONICAL_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'project-document/README.md',
  `${TECH}/README.md`,
  `${TECH}/ARCHITECTURE_DECISIONS.md`,
  `${TECH}/FEATURE_TRACEABILITY.md`,
  `${TECH}/monopoly.shared.instructions.md`,
  `${TECH}/monopoly.client.instructions.md`,
  `${TECH}/monopoly.api.instructions.md`,
  `${TECH}/monopoly.game-core.instructions.md`,
  `${TECH}/monopoly.contracts.instructions.md`,
  `${TECH}/Api/README.md`,
  `${TECH}/Client/README.md`,
  `${TECH}/Desktop/README.md`,
  `${TECH}/GameCore/README.md`,
  `${TECH}/Persistence/README.md`,
  `${TECH}/Shared/README.md`,
  `${TECH}/testcase/README.md`,
  `${TECH}/testcase/RELEASE_ACCEPTANCE_MATRIX.md`,
];

/** Entry points the Documentation Hub must link to. */
export const HUB_LINK_TARGETS = CANONICAL_FILES.filter(file => file.startsWith(`${TECH}/`) && !file.includes('.instructions.md'));

/** Docs whose repo-relative code paths must exist: the current technical docs and the agent instructions. */
export const CURRENT_DOC_SCOPE = ['CLAUDE.md', 'AGENTS.md', 'project-document/README.md', `${TECH}/`];

export const CODE_PATH_ROOTS = ['apps/', 'packages/', 'services/', 'scripts/', 'e2e/', '.github/'];

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'generated', 'test-results', 'coverage', 'playwright-report', '.vite', '.turbo']);

/**
 * Deliberate exceptions, as `source.md -> target` exactly as written in the link. Keep empty unless a link must point at
 * something that is intentionally absent from the checkout (for example an archive published elsewhere).
 */
export const LINK_EXCEPTIONS = new Set([]);

const toPosix = value => value.split(path.sep).join('/');

function walkMarkdown(root, directory = root, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) walkMarkdown(root, path.join(directory, entry.name), found);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      found.push(toPosix(path.relative(root, path.join(directory, entry.name))));
    }
  }
  return found;
}

/** Replaces fenced code blocks and HTML comments with blank lines so line numbers stay correct. */
function stripBlocks(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let fence = null;
  const kept = lines.map((line) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return '';
    }
    if (marker) {
      fence = marker[1];
      return '';
    }
    return line;
  });
  return kept.join('\n').replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ''));
}

const stripInlineCode = line => line.replace(/(`+)[\s\S]*?\1/g, match => ' '.repeat(match.length));

export function githubSlug(heading) {
  const text = heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .trim()
    .toLowerCase();
  return text.replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

const anchorCache = new Map();
function anchorsOf(absoluteFile) {
  if (anchorCache.has(absoluteFile)) return anchorCache.get(absoluteFile);
  const anchors = new Set();
  const counts = new Map();
  for (const line of stripBlocks(readFileSync(absoluteFile, 'utf8')).split('\n')) {
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const base = githubSlug(heading[1]);
      const seen = counts.get(base) ?? 0;
      anchors.add(seen === 0 ? base : `${base}-${String(seen)}`);
      counts.set(base, seen + 1);
    }
    for (const explicit of line.matchAll(/<a\s+[^>]*(?:id|name)\s*=\s*["']([^"']+)["']/gi)) anchors.add(explicit[1]);
  }
  anchorCache.set(absoluteFile, anchors);
  return anchors;
}

function linkTargets(line) {
  const targets = [];
  const scrubbed = stripInlineCode(line);
  for (const match of scrubbed.matchAll(/!?\[(?:[^\]\\]|\\.)*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["'(][^)]*)?\)/g)) {
    targets.push(match[1].replace(/^<|>$/g, ''));
  }
  const definition = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/.exec(scrubbed);
  if (definition) targets.push(definition[1].replace(/^<|>$/g, ''));
  return targets;
}

function checkLinks(root, file, text, errors) {
  const lines = stripBlocks(text).split('\n');
  lines.forEach((line, index) => {
    for (const raw of linkTargets(line)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) continue;
      if (LINK_EXCEPTIONS.has(`${file} -> ${raw}`)) continue;
      const [rawPath, fragment] = raw.split('#', 2);
      let decoded;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        decoded = rawPath;
      }
      const target = decoded === ''
        ? path.join(root, file)
        : decoded.startsWith('/') ? path.join(root, decoded) : path.join(root, path.dirname(file), decoded);
      const where = `${file}:${String(index + 1)}`;
      if (!existsSync(target)) {
        errors.push(`${where}: broken link "${raw}" (no file or folder at ${toPosix(path.relative(root, target))})`);
        continue;
      }
      if (fragment && statSync(target).isFile() && target.toLowerCase().endsWith('.md')) {
        let anchor = fragment;
        try {
          anchor = decodeURIComponent(fragment);
        } catch { /* keep raw */ }
        if (!anchorsOf(target).has(anchor.toLowerCase()) && !anchorsOf(target).has(anchor)) {
          errors.push(`${where}: broken anchor "#${fragment}" in link "${raw}" (no matching heading in ${toPosix(path.relative(root, target))})`);
        }
      }
    }
  });
}

const inScope = file => CURRENT_DOC_SCOPE.some(scope => (scope.endsWith('/') ? file.startsWith(scope) : file === scope));

function checkCodePaths(root, file, text, errors) {
  const lines = stripBlocks(text).split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/(`+)([^`]+?)\1/g)) {
      let token = match[2].trim();
      if (!CODE_PATH_ROOTS.some(prefix => token.startsWith(prefix))) continue;
      if (/[*?{}<>$\s…|]/.test(token) || token.includes('...')) continue;
      token = token.replace(/:\d+(?:[-–]\d+)?$/, '').replace(/[.,;)]+$/, '');
      if (!existsSync(path.join(root, token))) {
        errors.push(`${file}:${String(index + 1)}: code path \`${token}\` does not exist (fix the path, or write it without a repo root prefix if it is not a path)`);
      }
    }
  });
}

function linkedFiles(root, file) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) return new Set();
  const linked = new Set();
  for (const line of stripBlocks(readFileSync(absolute, 'utf8')).split('\n')) {
    for (const raw of linkTargets(line)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
      const rawPath = raw.split('#', 1)[0];
      if (!rawPath) continue;
      let decoded = rawPath;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch { /* keep raw */ }
      linked.add(toPosix(path.relative(root, path.join(root, path.dirname(file), decoded))));
    }
  }
  return linked;
}

function checkIndexes(root, errors) {
  const techRoot = path.join(root, TECH);
  if (!existsSync(techRoot)) return;
  const techIndex = linkedFiles(root, `${TECH}/README.md`);
  for (const entry of readdirSync(techRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const moduleDir = `${TECH}/${entry.name}`;
    const moduleIndex = `${moduleDir}/README.md`;
    if (!existsSync(path.join(root, moduleIndex))) continue;
    if (!techIndex.has(moduleIndex) && !techIndex.has(moduleDir)) {
      errors.push(`${TECH}/README.md: module index ${moduleIndex} is not linked from the technical index`);
    }
    const linked = linkedFiles(root, moduleIndex);
    for (const child of readdirSync(path.join(root, moduleDir))) {
      const childPath = `${moduleDir}/${child}`;
      const orphanInstruction = child.endsWith('.instruction.md');
      const orphanChecklist = entry.name === 'testcase' && child.endsWith('.md') && child !== 'README.md';
      if ((orphanInstruction || orphanChecklist) && !linked.has(childPath)) {
        errors.push(`${moduleIndex}: ${childPath} is not linked from its module index (add it to the index table)`);
      }
    }
  }
  const hub = linkedFiles(root, 'project-document/README.md');
  for (const target of HUB_LINK_TARGETS) {
    if (!hub.has(target)) errors.push(`project-document/README.md: the Documentation Hub does not link canonical entry point ${target}`);
  }
}

/** Navigation docs whose code references must be full repo-relative paths (no `C/`, `game/x.ts` shorthand). */
export const MAPPING_DOCS = [
  'CLAUDE.md',
  'AGENTS.md',
  'project-document/README.md',
  `${TECH}/ARCHITECTURE_DECISIONS.md`,
  `${TECH}/FEATURE_TRACEABILITY.md`,
  `${TECH}/testcase/RELEASE_ACCEPTANCE_MATRIX.md`,
];

const CODE_EXTENSION = /\.(?:tsx?|mjs|cjs|js|json|css|ogg)$/;

function checkShorthandPaths(root, errors) {
  for (const file of MAPPING_DOCS) {
    const absolute = path.join(root, file);
    if (!existsSync(absolute)) continue;
    stripBlocks(readFileSync(absolute, 'utf8')).split('\n').forEach((line, index) => {
      for (const match of line.matchAll(/(`+)([^`]+?)\1/g)) {
        const token = match[2].trim().replace(/:\d+(?:[-–]\d+)?$/, '');
        if (!token.includes('/') || !CODE_EXTENSION.test(token) || /[*\s<>{}]/.test(token)) continue;
        if (CODE_PATH_ROOTS.some(prefix => token.startsWith(prefix))) continue;
        errors.push(`${file}:${String(index + 1)}: code path \`${token}\` is a shorthand; write it repo-relative (apps/…, packages/…)`);
      }
    });
  }
}

/** Event names declared in the shared Socket.IO contract (client→server and server→client maps). */
function sharedEventNames(root) {
  const file = path.join(root, 'packages/shared/src/events.ts');
  if (!existsSync(file)) return null;
  return new Set([...readFileSync(file, 'utf8').matchAll(/^\s+(?:'([a-z][a-z ]*)'|([a-z]+))\s*:\s*\(/gm)]
    .map(match => match[1] ?? match[2]));
}

/**
 * `Api/README.md` event tables: every event exists in the shared contract, a client→server row's handler file registers it,
 * and every shared event appears in the index.
 */
function checkEventIndex(root, errors) {
  const indexFile = `${TECH}/Api/README.md`;
  const absolute = path.join(root, indexFile);
  const names = sharedEventNames(root);
  if (!names || !existsSync(absolute)) return;
  const listed = new Set();
  stripBlocks(readFileSync(absolute, 'utf8')).split('\n').forEach((line, index) => {
    const cells = line.split('|').map(cell => cell.trim());
    if (cells.length < 4 || !cells[1].startsWith('`')) return;
    const events = [...cells[1].matchAll(/`([^`]+)`/g)].map(match => match[1]).filter(token => /^[a-z][a-z ]*$/.test(token));
    const handler = [...cells[2].matchAll(/`(apps\/server\/src\/socket\/[^`]+\.ts)`/g)].map(match => match[1]);
    for (const event of events) {
      listed.add(event);
      if (!names.has(event)) {
        errors.push(`${indexFile}:${String(index + 1)}: event \`${event}\` is not declared in packages/shared/src/events.ts`);
      } else if (handler.length === 1 && existsSync(path.join(root, handler[0]))
        && !readFileSync(path.join(root, handler[0]), 'utf8').includes(`'${event}'`)) {
        errors.push(`${indexFile}:${String(index + 1)}: handler ${handler[0]} does not register \`${event}\``);
      }
    }
  });
  for (const name of names) {
    if (!listed.has(name)) errors.push(`${indexFile}: shared event \`${name}\` is missing from the event tables`);
  }
}

/** FEATURE_TRACEABILITY.md: summary rows match the entries, totals match, PARTIAL/MISSING entries state their gap. */
function checkTraceability(root, errors) {
  const file = `${TECH}/FEATURE_TRACEABILITY.md`;
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) return;
  const text = readFileSync(absolute, 'utf8').replace(/\r\n?/g, '\n');
  const summary = new Map();
  for (const match of text.matchAll(/^\| (F\d{2}) \|.*\| (COMPLETE|PARTIAL|MISSING) \|\s*$/gm)) summary.set(match[1], match[2]);
  const entries = new Map();
  for (const section of text.split(/\n### /).slice(1)) {
    const id = /^(F\d{2})\b/.exec(section)?.[1];
    if (!id) continue;
    entries.set(id, section);
    for (const field of ['**Entry:**', '**Docs:**']) {
      if (!section.includes(field)) errors.push(`${file}: ${id} has no ${field} line`);
    }
    if (!section.includes('**Tests:**')) errors.push(`${file}: ${id} has no **Tests:** line`);
    const status = summary.get(id);
    if ((status === 'PARTIAL' || status === 'MISSING') && !section.includes('**Gap:**')) {
      errors.push(`${file}: ${id} is ${status} but its entry has no **Gap:** line`);
    }
  }
  for (const id of summary.keys()) if (!entries.has(id)) errors.push(`${file}: summary row ${id} has no matching entry`);
  for (const id of entries.keys()) if (!summary.has(id)) errors.push(`${file}: entry ${id} is missing from the summary table`);
  const counts = { COMPLETE: 0, PARTIAL: 0, MISSING: 0 };
  for (const status of summary.values()) counts[status] += 1;
  const totals = /Totals: (\d+) features — (\d+) COMPLETE, (\d+) PARTIAL, (\d+) MISSING/.exec(text);
  if (!totals) {
    errors.push(`${file}: the "Totals: N features — C COMPLETE, P PARTIAL, M MISSING" line is missing`);
  } else if (Number(totals[1]) !== summary.size || Number(totals[2]) !== counts.COMPLETE
    || Number(totals[3]) !== counts.PARTIAL || Number(totals[4]) !== counts.MISSING) {
    errors.push(`${file}: totals line says ${totals[0]} but the summary table has ${String(summary.size)} features — `
      + `${String(counts.COMPLETE)} COMPLETE, ${String(counts.PARTIAL)} PARTIAL, ${String(counts.MISSING)} MISSING`);
  }
}

export function validateDocs({ root = process.cwd() } = {}) {
  anchorCache.clear();
  const errors = [];
  for (const file of CANONICAL_FILES) {
    if (!existsSync(path.join(root, file))) errors.push(`${file}: canonical documentation file is missing`);
  }
  const claude = path.join(root, 'CLAUDE.md');
  const agents = path.join(root, 'AGENTS.md');
  if (existsSync(claude) && existsSync(agents)) {
    const normalize = file => readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
    const left = normalize(claude).split('\n');
    const right = normalize(agents).split('\n');
    const firstDiff = left.findIndex((line, index) => line !== right[index]);
    if (firstDiff !== -1 || left.length !== right.length) {
      const line = firstDiff === -1 ? Math.min(left.length, right.length) + 1 : firstDiff + 1;
      errors.push(`AGENTS.md:${String(line)}: CLAUDE.md and AGENTS.md differ (first difference at line ${String(line)}); keep them identical`);
    }
  }
  const files = walkMarkdown(root);
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8');
    checkLinks(root, file, text, errors);
    if (inScope(file)) checkCodePaths(root, file, text, errors);
  }
  checkIndexes(root, errors);
  checkShorthandPaths(root, errors);
  checkEventIndex(root, errors);
  checkTraceability(root, errors);
  return { errors, markdownFiles: files.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, markdownFiles } = validateDocs({ root });
  if (errors.length > 0) {
    process.stderr.write(`Documentation validation FAIL: ${String(errors.length)} problem(s) in ${String(markdownFiles)} Markdown files.\n`);
    for (const error of errors) process.stderr.write(`  - ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Documentation validation PASS: ${String(markdownFiles)} Markdown files.\n`);
  }
}
