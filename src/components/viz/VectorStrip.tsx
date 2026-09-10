import { useEffect, useRef } from 'react';

interface VectorStripProps {
  vector: Float32Array;
  height?: number;
  className?: string;
}

/**
 * Sign always maps to the same two colours, everywhere in the app.
 *
 * The embed step and the search step sit one click apart, and the copy tells
 * the reader the two strips are directly comparable. Flipping the palette
 * between them would teach the opposite of that.
 */
const POSITIVE = [11, 94, 215] as const;
const NEGATIVE = [234, 88, 12] as const;

/**
 * Draws an embedding as a strip of coloured cells, one per dimension.
 *
 * This is the closest thing to seeing an embedding. Every cell is one of the
 * 384 numbers: blue for positive, orange for negative, stronger colour for a
 * value further from zero. Two chunks about the same thing produce visibly
 * similar strips, which is the point worth noticing.
 *
 * It draws to a canvas rather than 384 elements. On a phone the strip is about
 * 300 CSS pixels wide, so each cell would be under one pixel and neighbouring
 * cells would be dropped by rounding. A canvas sized to the device pixel ratio
 * keeps every cell distinct, and costs one node instead of 384.
 */
export function VectorStrip({ vector, height = 34, className = '' }: VectorStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const draw = () => {
      const cssWidth = canvas.clientWidth;
      if (cssWidth === 0) return;

      // Draw at device resolution so cells stay separate on a dense screen.
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(cssWidth * ratio);
      const pixelHeight = Math.round(height * ratio);

      if (canvas.width !== width || canvas.height !== pixelHeight) {
        canvas.width = width;
        canvas.height = pixelHeight;
      }

      // Values cluster near zero, so scale against the largest one present.
      let peak = 0;
      for (let i = 0; i < vector.length; i++) {
        const magnitude = Math.abs(vector[i]);
        if (magnitude > peak) peak = magnitude;
      }
      const scale = peak === 0 ? 1 : peak;

      context.clearRect(0, 0, width, pixelHeight);

      const cell = width / vector.length;
      for (let i = 0; i < vector.length; i++) {
        const value = vector[i];
        const intensity = Math.min(1, Math.abs(value) / scale);
        const [r, g, b] = value >= 0 ? POSITIVE : NEGATIVE;

        // A faint floor keeps near-zero cells visible rather than pure white.
        context.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.06 + intensity * 0.94})`;
        // Round outward so adjacent cells meet with no seam between them.
        const left = Math.floor(i * cell);
        const right = Math.ceil((i + 1) * cell);
        context.fillRect(left, 0, right - left, pixelHeight);
      }
    };

    draw();

    // The strip is fluid, so redraw when its width changes.
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [vector, height]);

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full rounded-lg border border-ink-200 bg-white ${className}`}
      style={{ height }}
      role="img"
      aria-label={`Embedding shown as ${vector.length} coloured cells, one for each dimension. Blue cells are positive values, orange are negative, and stronger colour means a value further from zero.`}
    />
  );
}
