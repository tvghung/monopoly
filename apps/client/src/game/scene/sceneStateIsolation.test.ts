import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sceneRoot = path.dirname(fileURLToPath(import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

/**
 * `GameScene` shadows the room-state context above the canvas so that a socket update does not commit the 3D scene (react-three-fiber
 * re-provides every ancestor context inside the canvas). That is only sound while nothing in the scene reads the room state.
 */
describe('the 3D scene does not read the room state context', () => {
  it('imports the app state context from GameScene.tsx only, where it shadows it', () => {
    const importers = sourceFiles(sceneRoot)
      .filter(file => /from\s+'(\.\.?\/)+internal'/.test(readFileSync(file, 'utf8')))
      .map(file => path.relative(sceneRoot, file).replaceAll(path.sep, '/'));
    expect(importers).toEqual(['GameScene.tsx']);
  });

  it('has source files to scan', () => {
    expect(sourceFiles(sceneRoot).length).toBeGreaterThan(50);
  });
});

const clientSrc = path.resolve(sceneRoot, '../..');

function resolveImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
    .find(candidate => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

/** Every non-test file reachable from `GameScene.tsx` through static and dynamic relative imports, however far outside `game/scene`. */
function importClosure(entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)'([^']+)'/g)) {
      const target = resolveImport(file, match[1]);
      if (target && !seen.has(target) && !/\.test\.(ts|tsx)$/.test(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

/**
 * The scan above only sees files under `game/scene`. A scene file could still reach the room state through a hook or a component
 * it imports from elsewhere, which would then read the shadow and fail at the first `state` access in production, not in a test.
 * So the whole import closure of the scene is checked: it may reach `internal` (the context) only from `GameScene.tsx`.
 */
describe('nothing the 3D scene imports, at any depth, reads the room state context', () => {
  const closure = importClosure(path.join(sceneRoot, 'GameScene.tsx'));

  it('walks the whole scene (the resolver found its imports)', () => {
    expect(closure.size).toBeGreaterThan(100);
    expect([...closure].some(file => file.endsWith(`${path.sep}settings${path.sep}selectors.ts`))).toBe(true);
  });

  it('reaches the state context only from GameScene.tsx', () => {
    const readers = [...closure]
      .filter(file => /\binternal'/.test(readFileSync(file, 'utf8')))
      .map(file => path.relative(clientSrc, file).replaceAll(path.sep, '/'));
    expect(readers).toEqual(['game/scene/GameScene.tsx']);
  });
});
