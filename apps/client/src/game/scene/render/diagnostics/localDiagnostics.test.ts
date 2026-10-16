import { describe, expect, it } from 'vitest';
import { isDiagnosticsLocation, isRenderDiagnosticsOptedOut } from './localDiagnostics';

describe('isDiagnosticsLocation', () => {
  it('accepts loopback hosts and explicit UAT pages only', () => {
    expect(isDiagnosticsLocation('127.0.0.1', '')).toBe(true);
    expect(isDiagnosticsLocation('localhost', '?x=1')).toBe(true);
    expect(isDiagnosticsLocation('192.168.1.20', '?phase4-uat=1')).toBe(true);
    expect(isDiagnosticsLocation('192.168.1.20', '')).toBe(false);
    expect(isDiagnosticsLocation('example.com', '?phase4-uat=0')).toBe(false);
  });
});

describe('isRenderDiagnosticsOptedOut', () => {
  it('is off by default and only an explicit off/0/false opts out', () => {
    expect(isRenderDiagnosticsOptedOut('')).toBe(false);
    expect(isRenderDiagnosticsOptedOut('?phase4-uat=1')).toBe(false);
    expect(isRenderDiagnosticsOptedOut('?renderDiagnostics=on')).toBe(false);
    expect(isRenderDiagnosticsOptedOut('?renderDiagnostics=off')).toBe(true);
    expect(isRenderDiagnosticsOptedOut('?phase4-uat=1&renderDiagnostics=0')).toBe(true);
    expect(isRenderDiagnosticsOptedOut('?renderDiagnostics=false')).toBe(true);
  });
});
