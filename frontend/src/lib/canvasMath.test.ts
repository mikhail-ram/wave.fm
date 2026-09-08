import { describe, it, expect } from 'vitest';
import { calculatePerimeterTrace } from './canvasMath';

describe('calculatePerimeterTrace', () => {
  const size = 10;
  const cx = 50;
  const cy = 50;
  
  // Square Corners:
  // TL: (40, 40)
  // TR: (60, 40)
  // BR: (60, 60)
  // BL: (40, 60)

  it('returns empty array at 0% progress', () => {
    const points = calculatePerimeterTrace(0, size, cx, cy);
    expect(points.length).toBe(0);
  });

  it('traces to top-right corner at 25% progress', () => {
    const points = calculatePerimeterTrace(0.25, size, cx, cy);
    expect(points).toEqual([
      { x: 40, y: 40 }, // start TL
      { x: 60, y: 40 }  // end TR
    ]);
  });

  it('traces to bottom-right corner at 50% progress', () => {
    const points = calculatePerimeterTrace(0.5, size, cx, cy);
    expect(points).toEqual([
      { x: 40, y: 40 }, // start TL
      { x: 60, y: 40 }, // TR
      { x: 60, y: 60 }  // end BR
    ]);
  });

  it('traces to bottom-left corner at 75% progress', () => {
    const points = calculatePerimeterTrace(0.75, size, cx, cy);
    expect(points).toEqual([
      { x: 40, y: 40 }, // start TL
      { x: 60, y: 40 }, // TR
      { x: 60, y: 60 }, // BR
      { x: 40, y: 60 }  // end BL
    ]);
  });

  it('completes the square at 100% progress', () => {
    const points = calculatePerimeterTrace(1.0, size, cx, cy);
    expect(points).toEqual([
      { x: 40, y: 40 }, // start TL
      { x: 60, y: 40 }, // TR
      { x: 60, y: 60 }, // BR
      { x: 40, y: 60 }, // BL
      { x: 40, y: 40 }  // end TL
    ]);
  });

  it('traces exactly halfway across the top edge at 12.5% progress', () => {
    const points = calculatePerimeterTrace(0.125, size, cx, cy);
    expect(points).toEqual([
      { x: 40, y: 40 },
      { x: 50, y: 40 } // exactly center top
    ]);
  });
});
