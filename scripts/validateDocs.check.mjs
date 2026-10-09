import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { CANONICAL_FILES, githubSlug, validateDocs } from './validateDocs.mjs';

const TECH = 'project-document/monopoly-websockets';
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

const TRACEABILITY = [
  '# Traceability',
  '',
  '| ID | Feature | Doc | Status |',
  '| --- | --- | --- | --- |',
  '| F01 | Roll | turn | COMPLETE |',
  '| F02 | Jail | turn | PARTIAL |',
  '',
  '**Totals: 2 features — 1 COMPLETE, 1 PARTIAL, 0 MISSING.**',
  '',
  '### F01 Roll',
  '- **Entry:** roll key.',
  '- **Docs:** turn.',
  '- **Tests:** `apps/server/src/socket/turn.ts`.',
  '',
  '### F02 Jail',
  '- **Entry:** jail.',
  '- **Docs:** turn.',
  '- **Tests:** none.',
  '- **Gap:** no socket test.',
  '',
].join('\n');

/** A minimal documentation tree that passes every check; tests then break one thing at a time. */
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'validate-docs-'));
  roots.push(root);
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  write('apps/server/src/socket/turn.ts', 'export {};\n');
  for (const file of CANONICAL_FILES) write(file, `# ${path.basename(file)}\n`);
  const agents = '# Agent rules\n\nRead [the hub](project-document/README.md). Rolls live in `apps/server/src/socket/turn.ts`.\n';
  write('CLAUDE.md', agents);
  write('AGENTS.md', agents);
  const hubTargets = CANONICAL_FILES.filter(file => file.startsWith(`${TECH}/`) && !file.includes('.instructions.md'));
  write('project-document/README.md', `# Hub\n\n${hubTargets.map(file => `- [${file}](${file.replace('project-document/', '')})`).join('\n')}\n`);
  const modules = ['Api', 'Client', 'Desktop', 'GameCore', 'Persistence', 'Shared', 'testcase'];
  write(`${TECH}/README.md`, `# Technical index\n\n${modules.map(name => `- [${name}](./${name}/README.md)`).join('\n')}\n`);
  write(`${TECH}/Api/README.md`, '# Api\n\n| Event | Doc |\n| --- | --- |\n| `roll dice` | [turn](./socket-turn.instruction.md#roll-dice) |\n');
  write(`${TECH}/Api/socket-turn.instruction.md`, '# Turn\n\n## Roll dice\n\nHandler `apps/server/src/socket/turn.ts:17`; tests `apps/**/*.test.ts`; payload `{ requestId }`.\n');
  write(`${TECH}/FEATURE_TRACEABILITY.md`, TRACEABILITY);
  write(`${TECH}/testcase/README.md`, '# Tests\n\n- [Release matrix](./RELEASE_ACCEPTANCE_MATRIX.md)\n- [Turn](./turn.md)\n');
  write(`${TECH}/testcase/turn.md`, '# Turn checklist\n\n```md\n[not a link](./missing.md) and `apps/missing.ts`\n```\n\nSee [GitHub](https://github.com) and [top](#turn-checklist).\n');
  return { root, write };
}

const errorsOf = root => validateDocs({ root }).errors;

describe('validateDocs', () => {
  it('passes a consistent tree, ignoring code fences, external URLs, globs and event names', () => {
    const { root } = fixture();
    assert.deepEqual(errorsOf(root), []);
  });

  it('reports a broken relative link with the file, line and resolved path', () => {
    const { root, write } = fixture();
    write(`${TECH}/Client/README.md`, '# Client\n\nSee [missing](../ui-ux-overhaul/PLAN.md).\n');
    const errors = errorsOf(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Client\/README\.md:3: broken link "\.\.\/ui-ux-overhaul\/PLAN\.md"/);
    assert.match(errors[0], /monopoly-websockets\/ui-ux-overhaul\/PLAN\.md/);
  });

  it('reports a broken anchor but accepts a heading anchor written with GitHub slug rules', () => {
    const { root, write } = fixture();
    write(`${TECH}/Api/README.md`, '# Api\n\n[ok](./socket-turn.instruction.md#roll-dice) [bad](./socket-turn.instruction.md#lan-lookup)\n'
      + '[turn](./socket-turn.instruction.md)\n');
    const errors = errorsOf(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /broken anchor "#lan-lookup"/);
    assert.equal(githubSlug('Thuế Thu Nhập (tile 4) — `expense`'), 'thuế-thu-nhập-tile-4--expense');
  });

  it('fails when CLAUDE.md and AGENTS.md differ, but not for line endings alone', () => {
    const { root, write } = fixture();
    write('AGENTS.md', '# Agent rules\r\n\r\nRead [the hub](project-document/README.md). Rolls live in `apps/server/src/socket/turn.ts`.\r\n');
    assert.deepEqual(errorsOf(root), []);
    write('AGENTS.md', '# Agent rules\n\nRead the hub.\n');
    const errors = errorsOf(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /AGENTS\.md:3: CLAUDE\.md and AGENTS\.md differ/);
  });

  it('reports a missing code path in current docs, and ignores the same token in historical docs', () => {
    const { root, write } = fixture();
    write(`${TECH}/GameCore/README.md`, '# GameCore\n\nPresence lives in `apps/server/src/services/presence.ts`.\n');
    write('project-document/ui-ux-overhaul/OLD_PLAN.md', '# Old\n\nUsed `apps/desktop/postgres-resources.json`.\n');
    const errors = errorsOf(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /GameCore\/README\.md:3: code path `apps\/server\/src\/services\/presence\.ts` does not exist/);
  });

  it('reports a missing canonical file and an instruction file that no module index links', () => {
    const { root, write } = fixture();
    rmSync(path.join(root, `${TECH}/ARCHITECTURE_DECISIONS.md`));
    write(`${TECH}/Api/socket-chat.instruction.md`, '# Chat\n');
    const errors = errorsOf(root);
    assert.ok(errors.some(error => /ARCHITECTURE_DECISIONS\.md: canonical documentation file is missing/.test(error)), errors.join('\n'));
    assert.ok(errors.some(error => /socket-chat\.instruction\.md is not linked from its module index/.test(error)), errors.join('\n'));
  });

  it('reports a testcase checklist missing from the testcase index and a hub that skips an entry point', () => {
    const { root, write } = fixture();
    write(`${TECH}/testcase/chat.md`, '# Chat checklist\n');
    write('project-document/README.md', '# Hub\n');
    const errors = errorsOf(root);
    assert.ok(errors.some(error => /testcase\/chat\.md is not linked from its module index/.test(error)), errors.join('\n'));
    assert.ok(errors.some(error => /Documentation Hub does not link canonical entry point/.test(error)), errors.join('\n'));
  });
});

describe('validateDocs structured mappings', () => {
  it('checks the Api event index against the shared contract and the named handler file', () => {
    const { root, write } = fixture();
    write('packages/shared/src/events.ts', "export interface C {\n  'roll dice': (ack: () => void) => void;\n}\n"
      + 'export interface S {\n  update: (state: unknown) => void;\n}\n');
    write('apps/server/src/socket/turn.ts', "socket.on('roll dice', handler);\n");
    write(`${TECH}/Api/README.md`, '# Api\n\n| Event | Handler | Doc |\n| --- | --- | --- |\n'
      + '| `roll dice`, `fly away` | `apps/server/src/socket/turn.ts` | [turn](./socket-turn.instruction.md) |\n');
    let errors = errorsOf(root);
    assert.ok(errors.some(error => /event `fly away` is not declared/.test(error)), errors.join('\n'));
    assert.ok(errors.some(error => /shared event `update` is missing from the event tables/.test(error)), errors.join('\n'));
    write('apps/server/src/socket/turn.ts', "socket.on('buy property', handler);\n");
    errors = errorsOf(root);
    assert.ok(errors.some(error => /turn\.ts does not register `roll dice`/.test(error)), errors.join('\n'));
  });

  it('checks traceability totals, matching entries and the gap line of a PARTIAL feature', () => {
    const { root, write } = fixture();
    write(`${TECH}/FEATURE_TRACEABILITY.md`, TRACEABILITY
      .replace('1 COMPLETE, 1 PARTIAL', '2 COMPLETE, 0 PARTIAL')
      .replace(/### F01 Roll[\s\S]*?(?=### F02)/, '')
      .replace('- **Gap:** no socket test.\n', ''));
    const errors = errorsOf(root);
    assert.ok(errors.some(error => /totals line says/.test(error)), errors.join('\n'));
    assert.ok(errors.some(error => /summary row F01 has no matching entry/.test(error)), errors.join('\n'));
    assert.ok(errors.some(error => /F02 is PARTIAL but its entry has no \*\*Gap:\*\* line/.test(error)), errors.join('\n'));
  });

  it('rejects shorthand code paths in mapping docs but keeps module-relative document names', () => {
    const { root, write } = fixture();
    const agents = '# Agent rules\n\nRead [the hub](project-document/README.md) and `GameCore/team-play.instruction.md`; code in `game/team.ts`.\n';
    write('CLAUDE.md', agents);
    write('AGENTS.md', agents);
    const errors = errorsOf(root);
    assert.equal(errors.length, 2, errors.join('\n'));
    assert.match(errors[0], /CLAUDE\.md:3: code path `game\/team\.ts` is a shorthand/);
    assert.match(errors[1], /AGENTS\.md:3: code path `game\/team\.ts` is a shorthand/);
  });
});
