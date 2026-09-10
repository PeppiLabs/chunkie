import { describe, expect, it } from 'vitest';
import { cosineSimilarity, projectTo2D } from '../vector';

const vec = (...values: number[]) => Float32Array.from(values);

describe('cosineSimilarity', () => {
  it('is 1 for identical direction', () => {
    expect(cosineSimilarity(vec(1, 2, 3), vec(1, 2, 3))).toBeCloseTo(1, 6);
  });

  it('ignores magnitude', () => {
    expect(cosineSimilarity(vec(1, 2, 3), vec(10, 20, 30))).toBeCloseTo(1, 6);
  });

  it('is 0 for perpendicular vectors', () => {
    expect(cosineSimilarity(vec(1, 0), vec(0, 1))).toBeCloseTo(0, 6);
  });

  it('is -1 for opposite direction', () => {
    expect(cosineSimilarity(vec(1, 1), vec(-1, -1))).toBeCloseTo(-1, 6);
  });

  it('returns 0 rather than NaN for a zero vector', () => {
    expect(cosineSimilarity(vec(0, 0, 0), vec(1, 2, 3))).toBe(0);
  });
});

describe('projectTo2D', () => {
  it('returns one point per input', () => {
    const vectors = Array.from({ length: 12 }, (_, i) => vec(Math.sin(i), Math.cos(i), i / 12));
    expect(projectTo2D(vectors).points).toHaveLength(12);
  });

  it('keeps every point inside the drawing range', () => {
    const vectors = Array.from({ length: 40 }, (_, i) =>
      vec(Math.sin(i) * 9, Math.cos(i * 2) * 4, (i % 7) - 3),
    );
    for (const point of projectTo2D(vectors).points) {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(point.y)).toBeLessThanOrEqual(1.0001);
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('finds the direction of greatest spread', () => {
    // Points vary a lot on the first axis and barely at all on the second, so
    // the projection should separate them along x.
    const vectors = Array.from({ length: 20 }, (_, i) => vec(i, 0.001 * (i % 2), 0));
    const { points } = projectTo2D(vectors);
    const spreadX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    const spreadY = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    expect(spreadX).toBeGreaterThan(spreadY);
  });

  it('places similar vectors near each other', () => {
    const a = vec(1, 0, 0);
    const aPrime = vec(0.99, 0.01, 0);
    const b = vec(0, 0, 1);
    const { points } = projectTo2D([a, aPrime, b]);

    const distance = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.hypot(p.x - q.x, p.y - q.y);

    expect(distance(points[0], points[1])).toBeLessThan(distance(points[0], points[2]));
  });

  it('projects an unseen vector onto the same axes', () => {
    const vectors = Array.from({ length: 10 }, (_, i) => vec(i, i * 0.5, 1));
    const { project, points } = projectTo2D(vectors);
    // Re-projecting an input must reproduce the point it was given.
    const again = project(vectors[3]);
    expect(again.x).toBeCloseTo(points[3].x, 5);
    expect(again.y).toBeCloseTo(points[3].y, 5);
  });

  it('survives identical vectors, which have no variance at all', () => {
    const same = Array.from({ length: 5 }, () => vec(0.5, 0.5, 0.5));
    const { points } = projectTo2D(same);
    expect(points).toHaveLength(5);
    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('handles zero and one input without throwing', () => {
    expect(projectTo2D([]).points).toEqual([]);
    expect(projectTo2D([vec(1, 2, 3)]).points).toEqual([{ x: 0, y: 0 }]);
  });

  it('keeps a query inside the drawing range when the chunks barely differ', () => {
    // Near identical chunks give a vanishingly small spread. Dividing an
    // unrelated query by it used to produce coordinates in the hundreds of
    // thousands, which put the marker far off canvas.
    const chunks = Array.from({ length: 5 }, (_, i) => {
      const v = new Float32Array(8).fill(0.35355339);
      v[0] += i * 1e-7;
      return v;
    });

    const { project } = projectTo2D(chunks);
    const query = new Float32Array(8);
    query[3] = 1;

    const point = project(query);
    expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(point.y)).toBeLessThanOrEqual(1);
  });

  it('keeps every projected query inside the drawing range', () => {
    const chunks = Array.from({ length: 30 }, (_, i) =>
      vec(Math.sin(i), Math.cos(i), i / 30, 1),
    );
    const { project } = projectTo2D(chunks);

    for (const outlier of [vec(50, -50, 50, -50), vec(-1e6, 1e6, 0, 0), vec(0, 0, 0, 0)]) {
      const point = project(outlier);
      expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(point.y)).toBeLessThanOrEqual(1);
    }
  });

  it('does not blow the argument limit on a very large set of vectors', () => {
    // Spreading an array this size into Math.max throws RangeError. A small
    // transcript of one-word messages can genuinely reach this many chunks.
    const many = Array.from({ length: 200000 }, (_, i) =>
      vec(Math.sin(i), Math.cos(i), i % 5, 1),
    );
    expect(() => projectTo2D(many)).not.toThrow();
  });

  it('still spreads a normal set of chunks across the map', () => {
    // A guard against over-clamping: normal data must not collapse to a dot.
    const chunks = Array.from({ length: 25 }, (_, i) =>
      vec(Math.sin(i / 2), Math.cos(i / 3), (i % 6) / 6, 1),
    );
    const { points } = projectTo2D(chunks);
    const spreadX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    expect(spreadX).toBeGreaterThan(0.5);
  });
});

describe('power iteration convergence', () => {
  it('converges on the true leading direction for clustered data', () => {
    // Two tight clusters far apart: the leading axis must separate them,
    // which is exactly what the map is claiming to show.
    const dims = 64;
    const make = (offset: number, seed: number) => {
      const v = new Float32Array(dims);
      for (let i = 0; i < dims; i++) v[i] = Math.sin(i * 0.7 + seed) * 0.05;
      v[0] += offset;
      return v;
    };

    const vectors = [
      ...Array.from({ length: 15 }, (_, i) => make(-1, i)),
      ...Array.from({ length: 15 }, (_, i) => make(1, i + 100)),
    ];

    const { points } = projectTo2D(vectors);
    const left = points.slice(0, 15).reduce((sum, p) => sum + p.x, 0) / 15;
    const right = points.slice(15).reduce((sum, p) => sum + p.x, 0) / 15;

    // The two groups must land on opposite sides, well apart.
    expect(Math.abs(right - left)).toBeGreaterThan(1);
  });
});
