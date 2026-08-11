import { describe, expect, it } from 'vitest';

import { durationLabel, metricsWindowLabel } from './duration.util';

describe('durationLabel', () => {
  it('picks the two coarsest units that are non-zero', () => {
    expect(durationLabel(0)).toBe('0s');
    expect(durationLabel(45)).toBe('45s');
    expect(durationLabel(120)).toBe('2m');
    expect(durationLabel(3600)).toBe('1h 0m');
    expect(durationLabel(14_520)).toBe('4h 2m');
    expect(durationLabel(90_000)).toBe('1d 1h');
  });

  it('refuses to invent a duration it cannot compute', () => {
    // A missing/garbled uptime must read as Unknown, not as a fresh restart.
    expect(durationLabel(-1)).toBe('Unknown');
    expect(durationLabel(Number.NaN)).toBe('Unknown');
    expect(durationLabel(Number.POSITIVE_INFINITY)).toBe('Unknown');
  });
});

describe('metricsWindowLabel', () => {
  it('distinguishes an absent window from a short one', () => {
    // `undefined` is the field being absent. Rendering it as "0s" would assert
    // a restart we never observed, which is the exact lie this label exists to
    // prevent next to an in-memory counter's zero.
    expect(metricsWindowLabel(undefined)).toBe('an unknown window');
    expect(metricsWindowLabel(0)).toBe('0s');
    expect(metricsWindowLabel(14_520)).toBe('4h 2m');
  });
});
