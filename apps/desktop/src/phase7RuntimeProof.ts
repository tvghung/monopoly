import { runPhase72HostProof } from './phase72HostProof';

/** Legacy proof command now exercises the packaged RAM authority contract. */
export async function runPhase7RuntimeProof(resourcesRoot = process.resourcesPath) {
  return runPhase72HostProof(resourcesRoot);
}
