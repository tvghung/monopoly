import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sceneRoot = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

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
