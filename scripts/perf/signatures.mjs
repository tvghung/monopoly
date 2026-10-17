/**
 * Pure analysis of first-use shader program signatures (Phase B3 prerequisite gate, 08D). Node built-ins only; unit tested by
 * `signatures.check.mjs`. Input is the raw `links`, `events` and `frames` the probe (`probe-init.js`, version 3) collected.
 *
 * A program is identified by its signature `sig` = `<vertex source hash>-<fragment source hash>` (the defines and prefix three.js
 * adds are part of the source, so the signature already distinguishes variants). Two runs are diffed by signature, never by count.
 */

/** Link classes of 08D step 3. `initial` = linked before the first labelled replay (load work, not a replay event). */
export const LINK_CLASSES = ['initial', 'new-variant', 'repeat-link', 'context-reset', 'renderer-recreation'];

/**
 * Classifies every link in time order.
 * - context-reset: a context-lost or context-restored event happened since the previous link (or the loss counters moved).
 * - renderer-recreation: the link's renderer or context identity was never seen on an earlier link, after at least one existed.
 * - repeat-link: the same signature was linked before in the same context.
 * - new-variant: a new signature in the same renderer and context.
 * - initial: any of the above that happened before the first replay label, reported separately (the load set).
 */
export function classifyLinks(links, events = []) {
  const ordered = [...links].sort((a, b) => a.t - b.t);
  const resetTimes = events.filter(event => event.kind === 'context-lost' || event.kind === 'context-restored').map(event => event.t);
  const seenSig = new Set();
  const seenRenderer = new Set();
  // A context created during a replay (not at load) is a new context identity; load-time contexts (other canvases) are not.
  const lateCtx = new Set(events.filter(event => event.kind === 'context-created' && event.replay != null).map(event => event.ctx));
  let previous = null;
  const out = [];
  for (const link of ordered) {
    const sinceReset = resetTimes.some(time => time > (previous ? previous.t : -Infinity) && time <= link.t)
      || (previous !== null && (link.ctxLost !== previous.ctxLost || link.ctxRestored !== previous.ctxRestored));
    const newRenderer = link.rendererId != null && seenRenderer.size > 0 && !seenRenderer.has(link.rendererId);
    const newCtx = lateCtx.has(link.ctx);
    const key = `${link.ctx}:${link.sig}`;
    let kind;
    if (sinceReset) kind = 'context-reset';
    else if (newRenderer || newCtx) kind = 'renderer-recreation';
    else if (seenSig.has(key)) kind = 'repeat-link';
    else kind = 'new-variant';
    const initial = link.replay == null;
    out.push({ ...link, kind, initial });
    seenSig.add(key);
    if (link.rendererId != null) seenRenderer.add(link.rendererId);
    previous = link;
  }
  return out;
}

/** Counts per class; `initial` links are counted under `initial`, replay links under their class. */
export function classCounts(classified) {
  const counts = Object.fromEntries(LINK_CLASSES.map(kind => [kind, 0]));
  for (const link of classified) counts[link.initial ? 'initial' : link.kind] += 1;
  return counts;
}

/** Signatures present in a link list, with first sighting, name, defines hash and how often each was linked. */
export function signatureTable(links) {
  const table = new Map();
  for (const link of [...links].sort((a, b) => a.t - b.t)) {
    const entry = table.get(link.sig);
    if (entry) { entry.links += 1; continue; }
    table.set(link.sig, {
      sig: link.sig, name: link.name || '', defineHash: link.defineHash, firstT: link.t, firstReplay: link.replay ?? null,
      firstNth: link.nth ?? null, links: 1, instanced: Boolean(link.instanced), skinned: Boolean(link.skinned), shadows: Boolean(link.shadows),
      lights: link.lightsDefine ?? [], tone: link.toneDefine ?? null, defines: link.defines ?? null,
    });
  }
  return [...table.values()];
}

/** Set difference by signature: what `b` has that `a` lacks and the reverse. */
export function diffSignatures(a, b) {
  const left = new Set(a.map(entry => entry.sig ?? entry));
  const right = new Set(b.map(entry => entry.sig ?? entry));
  return {
    onlyInA: [...left].filter(sig => !right.has(sig)).sort(),
    onlyInB: [...right].filter(sig => !left.has(sig)).sort(),
    common: [...left].filter(sig => right.has(sig)).length,
    identical: left.size === right.size && [...left].every(sig => right.has(sig)),
  };
}

/** Groups a signature table by material/shader name: the family view of a burst. */
export function familyView(table) {
  const families = new Map();
  for (const entry of table) {
    const key = entry.name || '(unnamed)';
    const family = families.get(key) ?? { name: key, signatures: 0, instanced: 0, skinned: 0, shadows: 0 };
    family.signatures += 1;
    family.instanced += entry.instanced ? 1 : 0;
    family.skinned += entry.skinned ? 1 : 0;
    family.shadows += entry.shadows ? 1 : 0;
    families.set(key, family);
  }
  return [...families.values()].sort((x, y) => y.signatures - x.signatures || x.name.localeCompare(y.name));
}

/**
 * Throttled-page intervals: gaps between consecutive scheduler frames at or above `minGapMs` during which the resource counters
 * did not change and no program linked, optionally only inside replay `windows` (`{start,end}`). `samples` are `{ t, geometries, textures, programs }` (per-replay census).
 */
export function throttledIntervals(frames, links, samples, { minGapMs = 500, windows = null } = {}) {
  const ordered = [...frames].sort((a, b) => a.start - b.start);
  const out = [];
  for (let index = 1; index < ordered.length; index += 1) {
    // Only a gap that follows a frame which scheduled a continuation (an animation was running) can be a stall or a throttled page.
    if (ordered[index - 1].continued === false) continue;
    const from = ordered[index - 1].start;
    const to = ordered[index].start;
    if (to - from < minGapMs) continue;
    // Between replays the demand-rendered scene is legitimately idle: only gaps inside a replay window can be a throttled page.
    if (windows && !windows.some(window => from >= window.start && to <= window.end)) continue;
    const linked = links.some(link => link.t >= from && link.t <= to);
    const before = [...samples].filter(sample => sample.t <= from).pop();
    const after = samples.find(sample => sample.t >= to);
    const flat = Boolean(before && after
      && before.geometries === after.geometries && before.textures === after.textures && before.programs === after.programs);
    out.push({ from, to, gapMs: to - from, linked, countersFlat: flat });
  }
  return out;
}

/** Stall frames: scheduler frames whose CPU time or the gap to the previous frame is at least `minMs`, with links inside. */
export function stallFrames(frames, links, { minMs = 250, windows = null } = {}) {
  const ordered = [...frames].sort((a, b) => a.start - b.start);
  const out = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const frame = ordered[index];
    const previous = index > 0 ? ordered[index - 1].start : null;
    // The scene is demand-rendered: a long gap between replays is idleness, so with windows only in-window gaps count.
    const inWindow = previous !== null && ordered[index - 1].continued !== false && (!windows || windows.some(window => previous >= window.start && frame.start <= window.end));
    const gap = inWindow ? frame.start - previous : 0;
    if (frame.cpu < minMs && gap < minMs) continue;
    const linked = links.filter(link => link.t >= frame.start && link.t <= frame.start + frame.cpu);
    out.push({ start: frame.start, cpuMs: frame.cpu, gapMs: gap, linksInside: linked.length, linkMs: linked.reduce((total, link) => total + link.dur, 0) });
  }
  return out;
}

/**
 * Longest ACTIVE frame: the worst scheduler callback (CPU time) and the worst active contiguous interval, i.e. the rAF-to-rAF gap
 * that follows a frame which scheduled a continuation (an animation was running). A gap after a frame that did not schedule one is a
 * legitimate idle gap of the demand-rendered scene and is reported separately as `maxIdleGapMs`, never as a frame time.
 */
export function longestFrame(frames) {
  const ordered = [...frames].filter(frame => frame.rendered).sort((a, b) => a.start - b.start);
  let maxCpu = 0;
  let maxActive = 0;
  let maxIdle = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    maxCpu = Math.max(maxCpu, ordered[index].cpu);
    if (index === 0) continue;
    const gap = ordered[index].start - ordered[index - 1].start;
    if (ordered[index - 1].continued === false) maxIdle = Math.max(maxIdle, gap);
    else maxActive = Math.max(maxActive, gap);
  }
  return { maxCpuMs: maxCpu, maxActiveIntervalMs: maxActive, maxIdleGapMs: maxIdle, renderedFrames: ordered.length };
}
