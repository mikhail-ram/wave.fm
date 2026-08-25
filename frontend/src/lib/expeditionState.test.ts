import { describe, it, expect } from 'vitest';
import { reduceExpeditionState, isJourneyLocked, ExpeditionState } from './expeditionState';

const createBaseState = (overrides: Partial<ExpeditionState> = {}): ExpeditionState => ({
  activeTab: "discover",
  currentTrackId: "A",
  sourceTrackId: "A",
  destTrackId: "",
  highlightedPathIds: [],
  manualTargetId: null,
  playbackHistory: ["A"],
  ...overrides
});

describe('Wave.fm Expedition State Machine', () => {

  describe('Discover Mode', () => {
    it('Single click manually targets a node without changing current track', () => {
      const state = createBaseState();
      const next = reduceExpeditionState(state, { type: 'SINGLE_CLICK', nodeId: 'B' });
      
      expect(next.manualTargetId).toBe('B');
      expect(next.currentTrackId).toBe('A'); // Uninterrupted!
    });

    it('Double click executes a jump immediately', () => {
      const state = createBaseState();
      const next = reduceExpeditionState(state, { type: 'DOUBLE_CLICK', nodeId: 'B' });
      
      expect(next.currentTrackId).toBe('B');
      expect(next.sourceTrackId).toBe('B');
      expect(next.manualTargetId).toBeNull();
      expect(next.playbackHistory).toContain('B');
    });
  });

  describe('Interpolate Mode', () => {
    const activeRouteState = createBaseState({
      activeTab: "interpolate",
      sourceTrackId: "A",
      destTrackId: "D",
      highlightedPathIds: ["A", "B", "C", "D"],
      currentTrackId: "A"
    });

    it('Should lock sliders immediately when a route is plotted', () => {
      expect(isJourneyLocked(activeRouteState)).toBe(true); // Locked immediately upon setting destTrackId
      
      const inTransit = reduceExpeditionState(activeRouteState, { type: 'DOUBLE_CLICK', nodeId: 'B' });
      expect(isJourneyLocked(inTransit)).toBe(true); // Still locked
    });

    it('Should NOT unlock sliders if jumping backwards to a mid-path node', () => {
      const inTransit = reduceExpeditionState(activeRouteState, { type: 'DOUBLE_CLICK', nodeId: 'C' });
      expect(isJourneyLocked(inTransit)).toBe(true);
      
      const reversed = reduceExpeditionState(inTransit, { type: 'DOUBLE_CLICK', nodeId: 'B' });
      expect(reversed.currentTrackId).toBe('B');
      expect(isJourneyLocked(reversed)).toBe(true); // Still on journey!
    });

    it('Should NOT unlock sliders if reversing ALL the way back to source (User feedback)', () => {
      const inTransit = reduceExpeditionState(activeRouteState, { type: 'DOUBLE_CLICK', nodeId: 'B' });
      const parked = reduceExpeditionState(inTransit, { type: 'DOUBLE_CLICK', nodeId: 'A' });
      
      expect(parked.currentTrackId).toBe('A');
      expect(isJourneyLocked(parked)).toBe(true); // STILL Locked!
    });

    it('Double clicking OFF-PATH ejects to discover mode and destroys bridge', () => {
      const inTransit = reduceExpeditionState(activeRouteState, { type: 'DOUBLE_CLICK', nodeId: 'B' });
      
      // Node 'X' is not in ['A', 'B', 'C', 'D']
      const ejected = reduceExpeditionState(inTransit, { type: 'DOUBLE_CLICK', nodeId: 'X' });
      
      expect(ejected.currentTrackId).toBe('X');
      expect(ejected.activeTab).toBe('discover');
      expect(ejected.destTrackId).toBe('');
      expect(ejected.highlightedPathIds).toEqual([]);
      expect(isJourneyLocked(ejected)).toBe(false);
    });

    it('Switching to discover tab mid-journey preserves route but drops lock', () => {
      const inTransit = reduceExpeditionState(activeRouteState, { type: 'DOUBLE_CLICK', nodeId: 'B' });
      expect(isJourneyLocked(inTransit)).toBe(true);
      
      const switched = reduceExpeditionState(inTransit, { type: 'SET_TAB', tab: 'discover' });
      expect(switched.activeTab).toBe('discover');
      expect(isJourneyLocked(switched)).toBe(false); // Unlocked!
    });
    
    it('Switching back to interpolate recalibrates source from current location', () => {
      const inTransit = reduceExpeditionState(activeRouteState, { type: 'DOUBLE_CLICK', nodeId: 'B' });
      const switched = reduceExpeditionState(inTransit, { type: 'SET_TAB', tab: 'discover' });
      
      // Wander in discover
      const wander = reduceExpeditionState(switched, { type: 'DOUBLE_CLICK', nodeId: 'X' });
      
      // Switch back
      const back = reduceExpeditionState(wander, { type: 'SET_TAB', tab: 'interpolate' });
      expect(back.sourceTrackId).toBe('X'); // Recalibrated to current location!
      expect(back.destTrackId).toBe('D');   // Destination preserved!
    });
  });
});
