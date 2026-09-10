/**
 * The maths behind the search step.
 *
 * Two jobs live here: scoring a query against every chunk (cosine similarity),
 * and squashing 384 dimensions down to 2 so the vectors can be drawn on screen
 * (principal component analysis).
 */

/**
 * Cosine similarity between two vectors.
 *
 * For unit-length vectors, which is what the embedding model returns, this is
 * just the dot product. The result runs from 1 (same direction, so same
 * meaning) down through 0 (unrelated) to -1 (opposite).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  // A zero vector has no direction, so similarity is undefined. Report 0.
  return denominator === 0 ? 0 : dot / denominator;
}

/** Column-wise mean of a set of vectors. */
function meanVector(vectors: Float32Array[]): Float32Array {
  const dims = vectors[0].length;
  const mean = new Float32Array(dims);

  for (const vector of vectors) {
    for (let i = 0; i < dims; i++) mean[i] += vector[i];
  }
  for (let i = 0; i < dims; i++) mean[i] /= vectors.length;

  return mean;
}

/** Scales a vector to unit length, leaving a zero vector untouched. */
function normalise(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;

  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return out;
}

/**
 * Finds the direction of greatest variance by power iteration.
 *
 * Repeatedly projecting a random direction through the data and renormalising
 * converges on the leading eigenvector, without ever building the 384 by 384
 * covariance matrix.
 */
function leadingComponent(centred: Float32Array[], iterations = 64): Float32Array {
  const dims = centred[0].length;

  // A fixed starting direction keeps the map stable across renders.
  let component: Float32Array = new Float32Array(dims);
  for (let i = 0; i < dims; i++) component[i] = Math.sin(i + 1);
  component = normalise(component);

  for (let step = 0; step < iterations; step++) {
    const next = new Float32Array(dims);

    for (const row of centred) {
      let projection = 0;
      for (let i = 0; i < dims; i++) projection += row[i] * component[i];
      for (let i = 0; i < dims; i++) next[i] += projection * row[i];
    }

    const normalised = normalise(next);

    // Bail out once the direction stops moving.
    //
    // Drift is summed over every component, so the threshold has to scale with
    // how many there are. A flat 1e-6 against a 384 component sum demands
    // per-component movement below float32 precision, which never happens, so
    // the loop always ran to its cap and the exit was decoration.
    let drift = 0;
    for (let i = 0; i < dims; i++) drift += Math.abs(normalised[i] - component[i]);
    component = normalised;
    if (drift < dims * 1e-6) break;
  }

  return component;
}

/** Removes a direction from every row, so the next search finds something new. */
function deflate(centred: Float32Array[], component: Float32Array): Float32Array[] {
  return centred.map((row) => {
    let projection = 0;
    for (let i = 0; i < row.length; i++) projection += row[i] * component[i];

    const out = new Float32Array(row.length);
    for (let i = 0; i < row.length; i++) out[i] = row[i] - projection * component[i];
    return out;
  });
}

export interface Projection {
  /** One {x, y} per input vector, in the same order. */
  points: { x: number; y: number }[];
  /** Projects a further vector onto the same axes, used for the query point. */
  project: (vector: Float32Array) => { x: number; y: number };
}

/**
 * Projects high-dimensional vectors onto two axes for display.
 *
 * The two axes are the directions along which the chunks differ most, so
 * chunks that land near each other on screen really are close in meaning.
 * Two dimensions cannot hold everything 384 did, so the map is an honest
 * summary rather than the full picture.
 */
export function projectTo2D(vectors: Float32Array[]): Projection {
  const identity = { x: 0, y: 0 };

  if (vectors.length === 0) {
    return { points: [], project: () => identity };
  }

  // One point has no variance to measure, so put it in the middle.
  if (vectors.length === 1) {
    return { points: [identity], project: () => identity };
  }

  const mean = meanVector(vectors);
  const centred = vectors.map((vector) => {
    const row = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) row[i] = vector[i] - mean[i];
    return row;
  });

  const axisX = leadingComponent(centred);
  const axisY = leadingComponent(deflate(centred, axisX));

  const project = (vector: Float32Array) => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < vector.length; i++) {
      const value = vector[i] - mean[i];
      x += value * axisX[i];
      y += value * axisY[i];
    }
    return { x, y };
  };

  const raw = vectors.map(project);

  // Scale into -1 to 1 so the drawing code does not need to rescale.
  // A loop rather than Math.max(...array): spreading a large array into
  // arguments throws RangeError, and a big transcript really can produce
  // more chunks than the argument limit allows.
  let spread = 0;
  for (const point of raw) {
    const magnitude = Math.max(Math.abs(point.x), Math.abs(point.y));
    if (magnitude > spread) spread = magnitude;
  }

  /**
   * Chunks that barely differ leave nothing real to measure.
   *
   * The axes then describe floating point noise, and dividing by that
   * vanishingly small spread magnifies the noise into a map that looks
   * meaningful and is not. Putting everything in the middle says the honest
   * thing: these chunks are all alike.
   */
  const centre = { x: 0, y: 0 };
  if (spread < 1e-9) {
    return { points: raw.map(() => centre), project: () => centre };
  }

  /**
   * Keeps a point inside the drawing area.
   *
   * The scale is fitted to the chunks, but a query is not one of them and can
   * legitimately fall outside their range. Left unclamped it lands far off
   * canvas and disappears, so pin it to the edge instead: still readable as
   * "further out than anything in this document".
   */
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const scale = (point: { x: number; y: number }) => ({
    x: clamp(point.x / spread),
    y: clamp(point.y / spread),
  });

  return {
    points: raw.map(scale),
    project: (vector: Float32Array) => scale(project(vector)),
  };
}
