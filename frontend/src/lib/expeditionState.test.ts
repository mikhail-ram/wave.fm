import { describe, it, expect } from 'vitest';
import { reduceExpeditionState, isJourneyLocked, ExpeditionState } from './expeditionState';

const createBaseState = (overrides: Partial<ExpeditionState> = {}): ExpeditionState => ({
  activeTab: "discover",
  currentTrackId: "A",
  sourceTrackId: "A",
  destTrackId: "",
  interpolateFocusMode: "DESTINATION",
  journeyState: "IDLE",
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

  describe('Interpolate Mode - New Google Maps Paradigm', () => {
    const idleInterpolate = createBaseState({
      activeTab: "interpolate",
      sourceTrackId: "A",
      destTrackId: "",
      interpolateFocusMode: "DESTINATION",
      journeyState: "IDLE",
      currentTrackId: "A"
    });

    it('Setting Destination transitions to PREVIEW', () => {
      const preview = reduceExpeditionState(idleInterpolate, { type: 'SINGLE_CLICK', nodeId: 'D' });
      expect(preview.destTrackId).toBe('D');
      expect(preview.journeyState).toBe('PREVIEW');
      expect(isJourneyLocked(preview)).toBe(false); // Not locked until initiated!
    });

    it('Changing Source in PREVIEW maintains PREVIEW state', () => {
      const preview = reduceExpeditionState(idleInterpolate, { type: 'SINGLE_CLICK', nodeId: 'D' });
      const focusedSource = reduceExpeditionState(preview, { type: 'SET_FOCUS_MODE', mode: 'SOURCE' });
      const newSourcePreview = reduceExpeditionState(focusedSource, { type: 'SINGLE_CLICK', nodeId: 'B' });
      
      expect(newSourcePreview.sourceTrackId).toBe('B');
      expect(newSourcePreview.destTrackId).toBe('D');
      expect(newSourcePreview.currentTrackId).toBe('A'); // Audio continues playing A!
      expect(newSourcePreview.journeyState).toBe('PREVIEW');
    });

    it('Initiating Expedition teleports audio to Source if different', () => {
      const preview = createBaseState({
        activeTab: "interpolate",
        currentTrackId: "A", // Listening to A
        sourceTrackId: "B", // Planning route from B
        destTrackId: "D", // to D
        journeyState: "PREVIEW"
      });

      const locked = reduceExpeditionState(preview, { type: 'INITIATE_EXPEDITION' });
      
      expect(locked.journeyState).toBe('LOCKED');
      expect(locked.currentTrackId).toBe('B'); // TELEPORTED!
      expect(locked.playbackHistory).toContain('B');
      expect(isJourneyLocked(locked)).toBe(true);
    });

    it('Double clicking OFF-PATH during journey ejects to discover mode', () => {
      const lockedRoute = createBaseState({
        activeTab: "interpolate",
        currentTrackId: "B",
        sourceTrackId: "B",
        destTrackId: "D",
        journeyState: "LOCKED",
        highlightedPathIds: ["B", "C", "D"]
      });
      
      // Node 'X' is not in ['B', 'C', 'D']
      const ejected = reduceExpeditionState(lockedRoute, { type: 'DOUBLE_CLICK', nodeId: 'X' });
      
      expect(ejected.currentTrackId).toBe('X');
      expect(ejected.activeTab).toBe('discover');
      expect(ejected.destTrackId).toBe('');
      expect(ejected.highlightedPathIds).toEqual([]);
      expect(isJourneyLocked(ejected)).toBe(false);
    });

    it('Switching to discover tab mid-journey IMPLICITLY ABORTS route', () => {
      const lockedRoute = createBaseState({
        activeTab: "interpolate",
        currentTrackId: "C", // Mid-journey
        sourceTrackId: "B",
        destTrackId: "D",
        journeyState: "LOCKED",
        highlightedPathIds: ["B", "C", "D"]
      });
      
      const switched = reduceExpeditionState(lockedRoute, { type: 'SET_TAB', tab: 'discover' });
      
      expect(switched.activeTab).toBe('discover');
      expect(switched.destTrackId).toBe(''); // Route cleared
      expect(switched.journeyState).toBe('IDLE');
      expect(isJourneyLocked(switched)).toBe(false);
    });
    
    it('Switching from Discover to Interpolate drops into IDLE with current track as source', () => {
      const discoverState = createBaseState({
        activeTab: "discover",
        currentTrackId: "X",
        sourceTrackId: "X",
        manualTargetId: "Y"
      });
      
      const switched = reduceExpeditionState(discoverState, { type: 'SET_TAB', tab: 'interpolate' });
      
      expect(switched.activeTab).toBe('interpolate');
      expect(switched.sourceTrackId).toBe('X'); 
      expect(switched.interpolateFocusMode).toBe('DESTINATION');
      expect(switched.journeyState).toBe('IDLE');
      expect(switched.manualTargetId).toBeNull(); // Cleared manual override
    });
  });
});
