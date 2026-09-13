function usableIPv4(value: string): boolean {
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = parts;
  return value !== '0.0.0.0' && first !== 127 && !(first === 169 && second === 254);
}
export function normalizeLanEndpoint(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash
    || !usableIPv4(parsed.hostname) || !parsed.port) return undefined;
  const port = Number(parsed.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) return undefined;
  return `http://${parsed.hostname}:${String(port)}`;
}
