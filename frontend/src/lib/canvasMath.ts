export interface Point {
  x: number;
  y: number;
}

/**
 * Calculates the exact line segments required to draw a square perimeter 
 * progress bar around a node on an HTML5 canvas.
 * 
 * @param progress Float from 0.0 to 1.0
 * @param size The half-width (radius) of the square node
 * @param cx Center X coordinate
 * @param cy Center Y coordinate
 * @returns Array of Points to be connected via ctx.lineTo(), starting with a moveTo.
 */
export function calculatePerimeterTrace(progress: number, size: number, cx: number, cy: number): Point[] {
  const p = Math.max(0, Math.min(1, progress));
  if (p === 0) return [];

  const points: Point[] = [];
  
  // Starting point: Top-Left corner
  points.push({ x: cx - size, y: cy - size });
  
  let remaining = p * (size * 8);

  // 1. Trace Top Edge (moving right)
  if (remaining > 0) {
    const step = Math.min(remaining, size * 2);
    points.push({ x: cx - size + step, y: cy - size });
    remaining -= step;
  }
  
  // 2. Trace Right Edge (moving down)
  if (remaining > 0) {
    const step = Math.min(remaining, size * 2);
    points.push({ x: cx + size, y: cy - size + step });
    remaining -= step;
  }
  
  // 3. Trace Bottom Edge (moving left)
  if (remaining > 0) {
    const step = Math.min(remaining, size * 2);
    points.push({ x: cx + size - step, y: cy + size });
    remaining -= step;
  }
  
  // 4. Trace Left Edge (moving up)
  if (remaining > 0) {
    const step = Math.min(remaining, size * 2);
    points.push({ x: cx - size, y: cy + size - step });
    remaining -= step;
  }

  return points;
}
