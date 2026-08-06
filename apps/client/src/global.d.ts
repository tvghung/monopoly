// Injected by Vite's `define` (see vite.config.ts) at build time. Empty string
// => connect to the same origin as the page.
declare const __SOCKET_URL__: string;

// Side-effect CSS imports (`import './x.css'`). TypeScript 6 requires a type
// declaration for side-effect imports, and this project builds CSS via Vite
// rather than the TS module resolver.
declare module '*.css';
