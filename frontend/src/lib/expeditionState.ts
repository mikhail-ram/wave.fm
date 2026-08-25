export type ExpeditionState = {
  activeTab: "discover" | "interpolate";
  currentTrackId: string;
  sourceTrackId: string;
  destTrackId: string;
  interpolateFocusMode: "SOURCE" | "DESTINATION";
  journeyState: "IDLE" | "PREVIEW" | "LOCKED";
  highlightedPathIds: string[];
  manualTargetId: string | null;
  playbackHistory: string[];
};

export type Action = 
  | { type: 'SINGLE_CLICK'; nodeId: string }
  | { type: 'DOUBLE_CLICK'; nodeId: string }
  | { type: 'SET_TAB'; tab: "discover" | "interpolate" }
  | { type: 'INITIATE_EXPEDITION' }
  | { type: 'ABORT_EXPEDITION' }
  | { type: 'SET_FOCUS_MODE'; mode: "SOURCE" | "DESTINATION" };

export function reduceExpeditionState(state: ExpeditionState, action: Action): ExpeditionState {
  const nextState = { ...state };
  
  if (action.type === 'SET_TAB') {
    nextState.activeTab = action.tab;
    if (action.tab === "interpolate") {
      nextState.sourceTrackId = state.currentTrackId;
      nextState.destTrackId = "";
      nextState.highlightedPathIds = [];
      nextState.interpolateFocusMode = "DESTINATION";
      nextState.journeyState = "IDLE";
      nextState.manualTargetId = null;
    } else {
      nextState.destTrackId = "";
      nextState.highlightedPathIds = [];
      nextState.journeyState = "IDLE";
      nextState.manualTargetId = null;
    }
    return nextState;
  }

  if (action.type === 'SET_FOCUS_MODE') {
    nextState.interpolateFocusMode = action.mode;
    return nextState;
  }
  
  if (action.type === 'SINGLE_CLICK') {
    if (state.activeTab === "discover") {
      nextState.manualTargetId = action.nodeId;
    } else if (state.activeTab === "interpolate") {
      if (state.journeyState !== "LOCKED") {
        if (state.interpolateFocusMode === "SOURCE") {
          nextState.sourceTrackId = action.nodeId;
        } else {
          nextState.destTrackId = action.nodeId;
        }
        if ((state.interpolateFocusMode === "SOURCE" && nextState.destTrackId) || 
            (state.interpolateFocusMode === "DESTINATION" && nextState.sourceTrackId)) {
          nextState.journeyState = "PREVIEW";
        }
      }
    }
    return nextState;
  }

  if (action.type === 'INITIATE_EXPEDITION') {
    if (state.activeTab === "interpolate" && state.journeyState === "PREVIEW") {
      nextState.journeyState = "LOCKED";
      if (state.sourceTrackId !== state.currentTrackId) {
        nextState.currentTrackId = state.sourceTrackId;
        if (!nextState.playbackHistory.includes(state.sourceTrackId)) {
          nextState.playbackHistory = [...nextState.playbackHistory, state.sourceTrackId];
        }
      }
    }
    return nextState;
  }

  if (action.type === 'ABORT_EXPEDITION') {
    nextState.destTrackId = "";
    nextState.highlightedPathIds = [];
    nextState.journeyState = "IDLE";
    return nextState;
  }
  
  if (action.type === 'DOUBLE_CLICK') {
    nextState.manualTargetId = null;
    if (!nextState.playbackHistory.includes(action.nodeId)) {
      nextState.playbackHistory = [...nextState.playbackHistory, action.nodeId];
    }
    nextState.currentTrackId = action.nodeId;
    
    if (state.activeTab === "discover") {
      nextState.sourceTrackId = action.nodeId;
      nextState.highlightedPathIds = [];
    } else if (state.activeTab === "interpolate") {
      if (!state.destTrackId) {
        nextState.sourceTrackId = action.nodeId;
      } else {
        if (!state.highlightedPathIds.includes(action.nodeId)) {
          // Off-path double-click: Eject & Jump
          nextState.destTrackId = "";
          nextState.sourceTrackId = action.nodeId;
          nextState.highlightedPathIds = [];
          nextState.activeTab = "discover";
          nextState.journeyState = "IDLE";
        } else {
          nextState.journeyState = "LOCKED";
        }
      }
    }
    return nextState;
  }
  
  return nextState;
}

export function isJourneyLocked(state: ExpeditionState): boolean {
  return state.activeTab === "interpolate" && state.journeyState === "LOCKED";
}
