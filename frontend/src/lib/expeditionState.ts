export type ExpeditionState = {
  activeTab: "discover" | "interpolate";
  currentTrackId: string;
  sourceTrackId: string;
  destTrackId: string;
  highlightedPathIds: string[];
  manualTargetId: string | null;
  playbackHistory: string[];
};

export type Action = 
  | { type: 'SINGLE_CLICK'; nodeId: string }
  | { type: 'DOUBLE_CLICK'; nodeId: string }
  | { type: 'SET_TAB'; tab: "discover" | "interpolate" };

export function reduceExpeditionState(state: ExpeditionState, action: Action): ExpeditionState {
  const nextState = { ...state };
  
  if (action.type === 'SET_TAB') {
    nextState.activeTab = action.tab;
    if (action.tab === "interpolate") {
      nextState.sourceTrackId = state.currentTrackId;
    } else {
      nextState.manualTargetId = null;
    }
    return nextState;
  }
  
  if (action.type === 'SINGLE_CLICK') {
    if (state.activeTab === "discover") {
      nextState.manualTargetId = action.nodeId;
    } else if (state.activeTab === "interpolate") {
      // Just inspect. No state change for current track or path.
    }
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
        }
      }
    }
    return nextState;
  }
  
  return nextState;
}

export function isJourneyLocked(state: ExpeditionState): boolean {
  return state.activeTab === "interpolate" && 
         state.destTrackId !== "" && 
         state.currentTrackId !== "" && 
         state.currentTrackId !== state.sourceTrackId;
}
