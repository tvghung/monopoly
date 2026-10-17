import assert from 'node:assert/strict';
import test from 'node:test';
import { classCounts, classifyLinks, diffSignatures, familyView, longestFrame, signatureTable, stallFrames, throttledIntervals } from './signatures.mjs';

const link = (t, sig, extra = {}) => ({ ctx: 0, t, dur: 2, name: 'MeshBasicMaterial', hash: 1, sig, rendererId: 0, ctxLost: 0, ctxRestored: 0, replay: 'soak:1', ...extra });

test('a first signature is a new variant, the same signature again is a repeat link', () => {
  const classified = classifyLinks([link(1, 'a-b'), link(2, 'c-d'), link(3, 'a-b')]);
  assert.deepEqual(classified.map(entry => entry.kind), ['new-variant', 'new-variant', 'repeat-link']);
});

test('links before the first replay label are initial, not replay events', () => {
  const classified = classifyLinks([link(1, 'a-b', { replay: null }), link(2, 'c-d')]);
  assert.deepEqual(classCounts(classified), { initial: 1, 'new-variant': 1, 'repeat-link': 0, 'context-reset': 0, 'renderer-recreation': 0 });
});

test('a context event between two links makes the later link a context reset', () => {
  const events = [{ kind: 'context-restored', t: 1.5 }];
  const classified = classifyLinks([link(1, 'a-b'), link(2, 'a-b')], events);
  assert.equal(classified[1].kind, 'context-reset');
});

test('a changed loss counter alone also marks a context reset', () => {
  const classified = classifyLinks([link(1, 'a-b'), link(2, 'c-d', { ctxLost: 1 })]);
  assert.equal(classified[1].kind, 'context-reset');
});

test('a renderer or context identity never seen before is a renderer recreation', () => {
  assert.equal(classifyLinks([link(1, 'a-b'), link(2, 'c-d', { rendererId: 7 })])[1].kind, 'renderer-recreation');
  assert.equal(classifyLinks([link(1, 'a-b'), link(2, 'c-d', { ctx: 3 })], [{ kind: 'context-created', ctx: 3, t: 1.5, replay: 'soak:4' }])[1].kind, 'renderer-recreation');
  // another canvas created at load linking its own programs is not a recreation
  assert.equal(classifyLinks([link(1, 'a-b'), link(2, 'c-d', { ctx: 3 })], [{ kind: 'context-created', ctx: 3, t: 0.5, replay: null }])[1].kind, 'new-variant');
});

test('the signature table keeps the first sighting and counts links', () => {
  const table = signatureTable([link(5, 'a-b', { replay: 'soak:2' }), link(1, 'a-b', { replay: 'soak:1' }), link(2, 'c-d')]);
  assert.equal(table.length, 2);
  const first = table.find(entry => entry.sig === 'a-b');
  assert.equal(first.links, 2);
  assert.equal(first.firstReplay, 'soak:1');
});

test('diffSignatures is by signature, not by count', () => {
  const diff = diffSignatures([{ sig: 'a' }, { sig: 'b' }], [{ sig: 'b' }, { sig: 'c' }]);
  assert.deepEqual(diff.onlyInA, ['a']);
  assert.deepEqual(diff.onlyInB, ['c']);
  assert.equal(diff.common, 1);
  assert.equal(diff.identical, false);
  assert.equal(diffSignatures([{ sig: 'a' }], [{ sig: 'a' }]).identical, true);
});

test('familyView groups by name and orders by size', () => {
  const view = familyView([{ name: 'X', instanced: true }, { name: 'X' }, { name: 'Y', skinned: true }]);
  assert.equal(view[0].name, 'X');
  assert.equal(view[0].signatures, 2);
  assert.equal(view[0].instanced, 1);
});

test('throttled intervals are long gaps with no link and flat counters', () => {
  const frames = [{ start: 0, cpu: 1 }, { start: 1000, cpu: 1 }, { start: 1016, cpu: 1 }];
  const samples = [{ t: 0, geometries: 5, textures: 2, programs: 9 }, { t: 1500, geometries: 5, textures: 2, programs: 9 }];
  const [gap] = throttledIntervals(frames, [], samples);
  assert.equal(gap.gapMs, 1000);
  assert.equal(gap.countersFlat, true);
  assert.equal(gap.linked, false);
  assert.equal(throttledIntervals(frames, [{ t: 500 }], samples)[0].linked, true);
  assert.equal(throttledIntervals(frames, [], samples, { windows: [{ start: 2000, end: 3000 }] }).length, 0);
  assert.equal(throttledIntervals(frames, [], samples, { windows: [{ start: 0, end: 1100 }] }).length, 1);
});

test('stall frames list the links compiled inside the callback', () => {
  const frames = [{ start: 0, cpu: 2 }, { start: 20, cpu: 2015 }];
  const stalls = stallFrames(frames, [link(30, 'a-b'), link(40, 'c-d'), link(5000, 'e-f')]);
  assert.equal(stalls.length, 1);
  assert.equal(stalls[0].linksInside, 2);
});

test('longestFrame reports the worst callback and the worst gap of rendered frames', () => {
  const stats = longestFrame([{ start: 0, cpu: 5, rendered: true }, { start: 40, cpu: 90, rendered: true }, { start: 50, cpu: 1, rendered: false }]);
  assert.equal(stats.maxCpuMs, 90);
  assert.equal(stats.maxGapMs, 40);
  assert.equal(stats.renderedFrames, 2);
});
