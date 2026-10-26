import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const LOOPBACK_ACCEPTANCE_FLAG = '--otb-loopback-acceptance';
export const LOOPBACK_ACCEPTANCE_PROFILE_PREFIX = '--otb-loopback-acceptance-profile=';

export interface LoopbackAcceptanceProfile {
  root: string;
  userData: string;
  sessionData: string;
  logs: string;
  temp: string;
  appData: string;
  localAppData: string;
  home: string;
  userCache: string;
  crashDumps: string;
}

export interface LoopbackAcceptanceConfig {
  readonly enabled: true;
  readonly profile: LoopbackAcceptanceProfile;
}

export function shouldEnableAutomaticUpdater(localAcceptance: LoopbackAcceptanceConfig | undefined): boolean {
  return localAcceptance === undefined;
}

function canonical(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/u, '').toLocaleLowerCase('en-US');
}

function isSameOrInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function pathsOverlap(first: string, second: string): boolean {
  const a = canonical(first);
  const b = canonical(second);
  return isSameOrInside(a, b) || isSameOrInside(b, a);
}

function lstatExists(value: string): boolean {
  try {
    lstatSync(value);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** No mode is the normal product path. A partial or malformed opt-in fails closed. */
export function parseLoopbackAcceptanceArguments(
  argv: readonly string[],
): { enabled: false } | { enabled: true; profileRoot: string } {
  const flags = argv.filter(value => value === LOOPBACK_ACCEPTANCE_FLAG);
  const profileArguments = argv.filter(value => value.startsWith(LOOPBACK_ACCEPTANCE_PROFILE_PREFIX));
  if (flags.length === 0 && profileArguments.length === 0) return { enabled: false };
  if (flags.length !== 1 || profileArguments.length !== 1) {
    throw new Error('Loopback acceptance requires exactly one mode flag and one profile path.');
  }
  if (argv.some(value => value.startsWith('--socket-url='))) {
    throw new Error('Loopback acceptance does not allow a configured socket URL.');
  }
  const profileRoot = profileArguments[0].slice(LOOPBACK_ACCEPTANCE_PROFILE_PREFIX.length).trim();
  if (!profileRoot || !path.isAbsolute(profileRoot)) {
    throw new Error('Loopback acceptance profile path must be absolute.');
  }
  return { enabled: true, profileRoot: path.resolve(profileRoot) };
}

/** Creates a never-reused app profile under a caller-selected evidence directory. */
export function prepareLoopbackAcceptanceProfile(
  requestedRoot: string,
  productionUserDataPath: string,
): LoopbackAcceptanceConfig {
  if (!path.isAbsolute(requestedRoot)) throw new Error('Loopback acceptance profile path must be absolute.');
  const requested = path.resolve(requestedRoot);
  const parent = path.dirname(requested);
  if (!existsSync(parent)) throw new Error('Loopback acceptance profile parent directory must already exist.');
  const realParent = realpathSync.native(parent);
  const root = path.join(realParent, path.basename(requested));
  const productionRoot = existsSync(productionUserDataPath)
    ? realpathSync.native(productionUserDataPath)
    : path.resolve(productionUserDataPath);
  if (pathsOverlap(root, productionRoot)) {
    throw new Error('Loopback acceptance profile must be separate from the production user-data directory.');
  }
  if (lstatExists(root)) throw new Error('Loopback acceptance profile already exists; choose a fresh path.');

  const profile: LoopbackAcceptanceProfile = {
    root,
    userData: path.join(root, 'user-data'),
    sessionData: path.join(root, 'session-data'),
    logs: path.join(root, 'logs'),
    temp: path.join(root, 'temp'),
    appData: path.join(root, 'app-data'),
    localAppData: path.join(root, 'local-app-data'),
    home: path.join(root, 'home'),
    userCache: path.join(root, 'user-cache'),
    crashDumps: path.join(root, 'crash-dumps'),
  };
  mkdirSync(root, { recursive: false });
  const profileDirectories = [profile.userData, profile.sessionData, profile.logs, profile.temp,
    profile.appData, profile.localAppData, profile.home, profile.userCache, profile.crashDumps];
  for (const directory of profileDirectories) mkdirSync(directory, { recursive: false });
  return { enabled: true, profile };
}

const SAFE_SYSTEM_ENVIRONMENT = new Set([
  'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'OS',
  'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'NUMBER_OF_PROCESSORS',
]);

/** The Host helper receives only Windows runtime variables, the isolated profile, and its explicit Host capability. */
export function loopbackAcceptanceEnvironment(
  source: NodeJS.ProcessEnv,
  profile: LoopbackAcceptanceProfile,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (name.toUpperCase() === 'PATH' || SAFE_SYSTEM_ENVIRONMENT.has(name.toUpperCase())) {
      environment[name] = value;
    }
  }
  const drive = path.parse(profile.home).root.replace(/[\\/]+$/u, '');
  const homePath = profile.home.slice(drive.length).replace(/[\\/]+/gu, '\\');
  Object.assign(environment, {
    APPDATA: profile.appData,
    LOCALAPPDATA: profile.localAppData,
    HOME: profile.home,
    USERPROFILE: profile.home,
    HOMEDRIVE: drive,
    HOMEPATH: homePath.startsWith('\\') ? homePath : `\\${homePath}`,
    TEMP: profile.temp,
    TMP: profile.temp,
    OTB_LOOPBACK_ACCEPTANCE_MODE: '1',
  });
  return environment;
}
