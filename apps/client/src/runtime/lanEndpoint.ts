function privateIPv4(value: string): boolean {
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = parts;
  return first === 10 || first === 192 && second === 168
    || first === 172 && second >= 16 && second <= 31;
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
    || !privateIPv4(parsed.hostname)) return undefined;
  const port = parsed.port ? Number(parsed.port) : 8080;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) return undefined;
  return `http://${parsed.hostname}:${String(port)}`;
}
