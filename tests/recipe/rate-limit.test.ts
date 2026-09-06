import { beforeEach, describe, expect, it } from 'vitest';
import {
  clientKey,
  consume,
  freeTier,
  paidTiers,
  rateHeaders,
  resetAllWindows,
  secretForTier,
  TIERS,
  tierById,
} from '@/lib/rate-limit';

beforeEach(() => {
  resetAllWindows();
});

describe('tiers', () => {
  it('offers exactly one free tier, first', () => {
    expect(TIERS.filter((t) => t.priceCents === 0)).toHaveLength(1);
    expect(TIERS[0].id).toBe('free');
  });

  it('orders paid tiers so each buys a higher ceiling than the last', () => {
    const limits = paidTiers().map((t) => t.limit);
    expect(limits).toEqual([...limits].sort((a, b) => a - b));
    expect(Math.min(...limits)).toBeGreaterThan(freeTier().limit);
  });

  it('charges more for more', () => {
    const prices = paidTiers().map((t) => t.priceCents);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
});

describe('secretForTier', () => {
  it('leaves the free tier on the base secret', () => {
    expect(secretForTier('base', freeTier())).toBe('base');
  });

  it('gives every paid tier a distinct secret', () => {
    const secrets = paidTiers().map((t) => secretForTier('base', t));
    // This is the whole mechanism by which a pass carries its tier: if two
    // tiers shared a secret, a cheap pass would verify as an expensive one.
    expect(new Set(secrets).size).toBe(secrets.length);
    expect(secrets.every((s) => s !== 'base')).toBe(true);
  });
});

describe('consume', () => {
  const tier = { id: 'test', name: 'Test', limit: 3, priceCents: 0 };

  it('allows up to the limit and refuses after it', () => {
    expect(consume('a', tier).allowed).toBe(true);
    expect(consume('a', tier).allowed).toBe(true);
    expect(consume('a', tier).allowed).toBe(true);
    expect(consume('a', tier).allowed).toBe(false);
  });

  it('counts each key separately', () => {
    consume('a', tier);
    consume('a', tier);
    consume('a', tier);
    expect(consume('b', tier).allowed).toBe(true);
  });

  it('reports what is left', () => {
    expect(consume('a', tier).remaining).toBe(2);
    expect(consume('a', tier).remaining).toBe(1);
    expect(consume('a', tier).remaining).toBe(0);
    // Never negative, however far over they go.
    expect(consume('a', tier).remaining).toBe(0);
  });

  it('starts a fresh window once the old one expires', () => {
    const start = 1_000_000;
    consume('a', tier, start);
    consume('a', tier, start);
    consume('a', tier, start);
    expect(consume('a', tier, start).allowed).toBe(false);
    expect(consume('a', tier, start + 61_000).allowed).toBe(true);
  });

  it('keeps the allowance for one key separate per tier', () => {
    const bigger = { id: 'bigger', name: 'Bigger', limit: 10, priceCents: 100 };
    for (let i = 0; i < 4; i += 1) consume('a', tier);
    // Buying a tier must not inherit the exhausted free window.
    expect(consume('a', bigger).allowed).toBe(true);
  });
});

describe('clientKey', () => {
  it('prefers x-real-ip', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1' },
    });
    expect(clientKey(request)).toBe('203.0.113.9');
  });

  it('takes the LAST forwarded hop, which the caller cannot forge', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.9' },
    });
    expect(clientKey(request)).toBe('203.0.113.9');
  });

  it('falls back to a constant when nothing identifies the caller', () => {
    expect(clientKey(new Request('https://example.com'))).toBe('unknown');
  });
});

describe('rateHeaders', () => {
  it('reports the ceiling, what is left, and the tier', () => {
    const headers = rateHeaders(consume('a', freeTier()));
    expect(headers['x-ratelimit-limit']).toBe(String(freeTier().limit));
    expect(headers['x-ratelimit-tier']).toBe('free');
    expect(Number(headers['x-ratelimit-reset'])).toBeGreaterThan(0);
  });
});

describe('tierById', () => {
  it('finds a known tier and nothing else', () => {
    expect(tierById('free')?.priceCents).toBe(0);
    expect(tierById('nope')).toBeUndefined();
  });
});
