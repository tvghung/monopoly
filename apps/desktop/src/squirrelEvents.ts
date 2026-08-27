export type SquirrelEventAction = 'create-shortcut' | 'remove-shortcut' | 'quit';

export function resolveSquirrelEvent(
  argv: readonly string[] = process.argv,
  platform: NodeJS.Platform = process.platform,
): SquirrelEventAction | undefined {
  if (platform !== 'win32') return undefined;

  const event = argv.find(value => value.startsWith('--squirrel-'));
  if (!event) return undefined;
  if (event === '--squirrel-install' || event === '--squirrel-updated') {
    return 'create-shortcut';
  }
  if (event === '--squirrel-uninstall') return 'remove-shortcut';
  return 'quit';
}
