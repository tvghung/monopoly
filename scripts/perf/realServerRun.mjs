// Starts the real authoritative server (desktop profile, so it serves a built client) for scripts/perf/realPathStart.mjs.
// Run from apps/server: node --import tsx <this file> <authoritativeServer.ts> <clientDist> <port>
import { pathToFileURL } from 'node:url';

const [,, serverEntry, clientDist, port] = process.argv;
const { startAuthoritativeServer } = await import(pathToFileURL(serverEntry).href);
const server = await startAuthoritativeServer({ clientDist, host: '127.0.0.1', port: Number(port) });
console.log(`READY ${server.port}`);
process.on('SIGTERM', () => { void server.shutdown('sigterm').then(() => process.exit(0)); });
