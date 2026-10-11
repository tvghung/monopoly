import { describe, expect, it } from 'vitest';
import {
  parseBenchmarkSeconds,
  percentile,
  summarizeFrameIntervals,
  summarizeRendererFrames,
} from './rendererBenchmark';

describe('percentile', () => {
  it('uses nearest rank on an ascending array', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile(values, 0)).toBe(1);
    expect(percentile([], 50)).toBe(0);
  });
});

describe('summarizeFrameIntervals', () => {
  it('drops warmup frames and reports median, p95, max and slow frames', () => {
    const warmup = [90, 80, 70, 60, 50];
    const steady = [...Array.from({ length: 19 }, () => 16), 40];
    const summary = summarizeFrameIntervals([...warmup, ...steady]);

    expect(summary.frames).toBe(20);
    expect(summary.averageFrameMs).toBe(17.2);
    expect(summary.averageFps).toBeCloseTo(1000 / 17.2, 5);
    expect(summary.medianFrameMs).toBe(16);
    expect(summary.p95FrameMs).toBe(16);
    expect(summary.maxFrameMs).toBe(40);
    expect(summary.medianFps).toBeCloseTo(62.5, 5);
    expect(summary.slowFrames).toBe(1);
  });

  it('summarizes actual scene submissions separately from browser animation callbacks', () => {
    const warmup = Array.from({ length: 5 }, () => ({
      timestampMs: 0, intervalMs: 0, cpuMs: 0, drawCalls: 0, triangles: 0,
    }));
    const steady = [10, 20, 30].map((intervalMs, index) => ({
      timestampMs: index * intervalMs,
      intervalMs,
      cpuMs: intervalMs / 5,
      drawCalls: 100 + index,
      triangles: 1_000 + index * 100,
    }));

    expect(summarizeRendererFrames([...warmup, ...steady])).toEqual({
      frames: 3,
      averageFps: 50,
      averageFrameMs: 20,
      p95FrameMs: 30,
      maxFrameMs: 30,
      averageCpuMs: 4,
      p95CpuMs: 6,
      maxCpuMs: 6,
      averageDrawCalls: 101,
      averageTriangles: 1_100,
    });
  });

  it('returns zeros when nothing was measured and ignores invalid samples', () => {
    expect(summarizeFrameIntervals([16, 16, 16])).toMatchObject({ frames: 0, medianFps: 0 });
    expect(summarizeFrameIntervals([1, 1, 1, 1, 1, 0, Number.NaN, 10], 5).frames).toBe(1);
  });
});

describe('parseBenchmarkSeconds', () => {
  it('accepts positive numbers and caps them at 120 seconds', () => {
    expect(parseBenchmarkSeconds('10')).toBe(10);
    expect(parseBenchmarkSeconds('2.5')).toBe(2.5);
    expect(parseBenchmarkSeconds('9999')).toBe(120);
  });

  it('rejects missing, zero, negative and non-numeric values', () => {
    for (const raw of [null, '', '0', '-3', 'abc']) expect(parseBenchmarkSeconds(raw)).toBeNull();
  });
});
