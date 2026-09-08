import { useState, useEffect, useRef } from "react";
import { CurrentTrack } from "@/components/CurrentTrack";
import { GraphCanvas } from "@/components/GraphCanvas";
import { ContextPanel } from "@/components/ContextPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import YouTube from 'react-youtube';

const Index = () => {
  const [audioLyricsValue, setAudioLyricsValue] = useState([50]);
  const [committedAudioWeight, setCommittedAudioWeight] = useState(0.5);
  const [activeTab, setActiveTab] = useState<"discover" | "interpolate" | "expedition">("discover");
  
  const [currentTrack, setCurrentTrack] = useState({
    id: "",
    title: "Loading...",
    artist: "Loading...",
    videoId: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [player, setPlayer] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoPlayNext, setAutoPlayNext] = useState(false);
  const [playbackHistory, setPlaybackHistory] = useState<string[]>([]);
  const playbackProgressRef = useRef(0);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [trackDuration, setTrackDuration] = useState(0);

  // Poll YouTube progress without re-rendering React tree
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && player) {
      interval = setInterval(async () => {
        try {
          const state = await player.getPlayerState();
          if (state !== 1) return; // 1 = PLAYING. Skip if buffering (3) or paused (2)
          
          const currentTime = await player.getCurrentTime();
          const duration = await player.getDuration();
          if (duration > 0) {
            if (duration !== trackDuration) setTrackDuration(duration);
            const progress = currentTime / duration;
            playbackProgressRef.current = progress;
            if (progressBarRef.current) {
              progressBarRef.current.style.width = `${progress * 100}%`;
            }
          }
        } catch (e) {}
      }, 100); // 100ms is fine now since it doesn't trigger React updates
    }
    return () => clearInterval(interval);
  }, [isPlaying, player, trackDuration]);

  // Graph state
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  
  // Interpolate state
  const [sourceTrackId, setSourceTrackId] = useState("");
  const [destTrackId, setDestTrackId] = useState("");
  const [sourceSearchQuery, setSourceSearchQuery] = useState("");
  const [destSearchQuery, setDestSearchQuery] = useState("");
  const [interpolateFocusMode, setInterpolateFocusMode] = useState<"SOURCE" | "DESTINATION">("DESTINATION");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [nSteps, setNSteps] = useState([10]);
  const [highlightedPathIds, setHighlightedPathIds] = useState<string[]>([]);
  const [ghostNodes, setGhostNodes] = useState<any[]>([]);
  const [manualTargetId, setManualTargetId] = useState<string | null>(null);
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const [journeyState, setJourneyState] = useState<"IDLE" | "PREVIEW" | "LOCKED">("IDLE");
  const clickTimerRef = useRef<{time: number, id: string | null}>({time: 0, id: null});

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [liveWeight, setLiveWeight] = useState(0.5);
  const isJourneyLocked = journeyState === "LOCKED";
  
  // Expedition State
  const [beacons, setBeacons] = useState<any[]>([]);
  const [expeditionTargetId, setExpeditionTargetId] = useState<string | null>(null);
  const [expeditionParScore, setExpeditionParScore] = useState<number | null>(null);
  const [isGeneratingMission, setIsGeneratingMission] = useState(false);
  
  // Fetch beacons on mount
  useEffect(() => {
    fetch('http://localhost:8000/api/capitals')
      .then(res => res.json())
      .then(data => setBeacons(data.capitals || []))
      .catch(err => console.error("Failed to load beacons", err));
  }, []);

  // Debounce the live slider value to avoid flooding the backend
  useEffect(() => {
    const handler = setTimeout(() => {
      if (committedAudioWeight !== liveWeight) {
        setCommittedAudioWeight(liveWeight);
      }
    }, 150);
    return () => clearTimeout(handler);
  }, [liveWeight, committedAudioWeight]);



  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch exact top 5 edges from backend when slider is committed (O(N) payload)
  useEffect(() => {
    fetch(`http://localhost:8000/api/graph?audio_weight=${committedAudioWeight}`)
      .then(res => res.json())
      .then(data => {
        setGraphData(prev => {
          if (prev.nodes.length === 0) return data;
          
          // Preserve existing Node Object References for physics stability
          const existingNodeMap = new Map(prev.nodes.map((n: any) => [n.id, n]));
          const preservedNodes = data.nodes.map((newNode: any) => {
            return existingNodeMap.get(newNode.id) || newNode;
          });
          
          return { nodes: preservedNodes, links: data.links };
        });
        
        // Initial setup
        if (data.nodes.length > 0 && !currentTrack.id) {
          const first = data.nodes[0];
          setCurrentTrack({
            id: first.id,
            title: first.title,
            artist: first.artist,
            videoId: first.videoId
          });
          setSourceTrackId(first.id);
          setPlaybackHistory([first.id]);
        }
      })
      .catch(err => console.error("Failed to load graph", err));
  }, [committedAudioWeight]);

  useEffect(() => {
    if (activeTab === "interpolate" && sourceTrackId && destTrackId) {
      const fetchInterpolation = async () => {
        setIsLoading(true);
        // Don't clear highlighted path immediately to avoid flickering while dragging
        try {
          const url = `http://localhost:8000/api/interpolate?source_id=${sourceTrackId}&dest_id=${destTrackId}&n_steps=${nSteps[0]}&audio_weight=${committedAudioWeight}`;
          const response = await fetch(url);
          if (!response.ok) throw new Error("API error");
          const data = await response.json();
          
          const ids = data.interpolated_tracks.map((t: any) => t.id);
          setHighlightedPathIds([sourceTrackId, ...ids, destTrackId]);
        } catch (error) {
          console.error("Failed to fetch interpolation", error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchInterpolation();
    } else if (activeTab === "interpolate" && !destTrackId) {
      // Cleanup the path if destination is cleared (e.g. user aborted)
      setHighlightedPathIds([]);
    }
  }, [activeTab, sourceTrackId, destTrackId, nSteps, committedAudioWeight]);

  // Search effect (debounced)
  const isInternalSearchUpdate = useRef(false);
  const activeSearchQuery = interpolateFocusMode === "SOURCE" ? sourceSearchQuery : destSearchQuery;
  
  useEffect(() => {
    if (!activeSearchQuery) {
      setSearchResults([]);
      return;
    }
    if (isInternalSearchUpdate.current) {
      isInternalSearchUpdate.current = false;
      return;
    }
    
    const delayDebounceFn = setTimeout(() => {
      fetch(`http://localhost:8000/api/search?q=${encodeURIComponent(activeSearchQuery)}`)
        .then(res => res.json())
        .then(data => {
          setSearchResults(data.results || []);
          setIsDropdownOpen(true);
        })
        .catch(err => console.error(err));
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [activeSearchQuery, interpolateFocusMode]);

  // Preview / Context Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [previewTrack, setPreviewTrack] = useState<{id: string, title: string, artist: string, videoId: string} | null>(null);
  const [previewPlayer, setPreviewPlayer] = useState<any | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewProgressRef = useRef(0);
  const [previewDuration, setPreviewDuration] = useState(0);

  // Poll preview YouTube progress
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPreviewPlaying && previewPlayer) {
      interval = setInterval(async () => {
        try {
          const state = await previewPlayer.getPlayerState();
          if (state !== 1) return;
          
          const currentTime = await previewPlayer.getCurrentTime();
          const duration = await previewPlayer.getDuration();
          if (duration > 0) {
            if (duration !== previewDuration) setPreviewDuration(duration);
            const progress = currentTime / duration;
            previewProgressRef.current = progress;
          }
        } catch (e) {}
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isPreviewPlaying, previewPlayer, previewDuration]);

  const generateMission = async () => {
    if (beacons.length === 0) return;
    setIsGeneratingMission(true);
    
    // Pick a random beacon that isn't the current one
    const otherBeacons = beacons.filter(b => b.id !== currentTrack.id);
    const target = otherBeacons[Math.floor(Math.random() * otherBeacons.length)];
    
    try {
      const res = await fetch(`http://localhost:8000/api/route?start=${currentTrack.id}&end=${target.id}`);
      const data = await res.json();
      setExpeditionTargetId(target.id);
      setExpeditionParScore(data.par_score);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingMission(false);
    }
  };

  const jumpToNearestBeacon = () => {
    if (beacons.length > 0) {
      const topBeacon = beacons[0]; // For now, just jump to the highest rank beacon
      const node = graphData.nodes.find((n: any) => n.id === topBeacon.id);
      if (node) executeJump(node);
    }
  };

  const executeJump = (node: any) => {
    // If we jump, stop previewing and close drawer
    setIsDrawerOpen(false);
    setPreviewNodeId(null);
    if (previewPlayer) previewPlayer.pauseVideo();
    setIsPreviewPlaying(false);

    setManualTargetId(null);
    setInspectedNodeId(null);
    setAutoPlayNext(true);
    setPlaybackHistory(prev => {
      if (!prev.includes(node.id)) return [...prev, node.id];
      return prev;
    });
    playbackProgressRef.current = 0;
    if (progressBarRef.current) progressBarRef.current.style.width = "0%";
    
    setCurrentTrack({
      id: node.id,
      title: node.title,
      artist: node.artist,
      videoId: node.videoId,
    });
    
    if (activeTab === "discover") {
      setSourceTrackId(node.id);
      setHighlightedPathIds([]);
    } else if (activeTab === "interpolate") {
      if (!destTrackId) {
        setSourceTrackId(node.id);
      } else {
        if (!highlightedPathIds.includes(node.id)) {
          // Off-path double-click: Eject & Jump
          setDestTrackId("");
          setDestSearchQuery("");
          setSourceTrackId(node.id);
          setSourceSearchQuery(`${node.title?.toUpperCase() || 'UNKNOWN'} // ${node.artist?.toUpperCase() || 'UNKNOWN'}`);
          setHighlightedPathIds([]);
          setJourneyState("IDLE");
          setActiveTab("discover"); // Kick to discover mode after ejecting
        } else {
          setJourneyState("LOCKED");
        }
      }
    }
  };

  const handleNodeClick = (node: any) => {
    const now = Date.now();
    const DOUBLE_CLICK_DELTA = 300; // ms
    
    if (clickTimerRef.current.id === node.id && (now - clickTimerRef.current.time) < DOUBLE_CLICK_DELTA) {
      // It's a double click! Execute the Jump.
      clickTimerRef.current = { time: 0, id: null };
      executeJump(node);
    } else {
      // It's a single click! Inspect / Target
      clickTimerRef.current = { time: now, id: node.id };
      
      const isNeighbor = graphData.links.some((l: any) => {
        const sid = l.source?.id || l.source;
        const tid = l.target?.id || l.target;
        return (sid === currentTrack.id && tid === node.id) || (tid === currentTrack.id && sid === node.id);
      });

      // Set preview state for Drawer
      setPreviewNodeId(node.id);
      setPreviewTrack({ id: node.id, title: node.title, artist: node.artist, videoId: node.videoId });
      setIsDrawerOpen(true);
      previewProgressRef.current = 0;
      if (previewPlayer) {
        previewPlayer.pauseVideo();
        previewPlayer.seekTo(0);
      }
      setIsPreviewPlaying(false);

      if (activeTab === "discover") {
        setInspectedNodeId(node.id);
        if (isNeighbor) {
          setManualTargetId(node.id);
        } else {
          setManualTargetId(null);
        }
      } else if (activeTab === "interpolate") {
        setInspectedNodeId(node.id);
        if (journeyState !== "LOCKED") {
          const nodeStr = `${node.title?.toUpperCase() || 'UNKNOWN'} // ${node.artist?.toUpperCase() || 'UNKNOWN'}`;
          if (interpolateFocusMode === "SOURCE") {
            setSourceTrackId(node.id);
            setSourceSearchQuery(nodeStr);
          } else {
            setDestTrackId(node.id);
            setDestSearchQuery(nodeStr);
          }
          if ((interpolateFocusMode === "SOURCE" && destTrackId) || (interpolateFocusMode === "DESTINATION" && sourceTrackId)) {
            setJourneyState("PREVIEW");
          }
        }
      }
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-sans text-white">
      {/* 3D Physics Graph Canvas */}
      <GraphCanvas
        graphData={graphData}
        audioWeight={committedAudioWeight}
        onNodeClick={handleNodeClick}
        selectedNodeId={currentTrack.id}
        sourceNodeId={activeTab === "interpolate" ? sourceTrackId : undefined}
        destNodeId={activeTab === "interpolate" ? destTrackId : undefined}
        highlightedPathIds={activeTab === "interpolate" ? highlightedPathIds : []}
        playbackProgressRef={playbackProgressRef}
        ghostNodes={ghostNodes}
        playbackHistory={playbackHistory}
        manualTargetId={manualTargetId}
        inspectedNodeId={inspectedNodeId}
        isJourneyLocked={journeyState === "LOCKED"}
        previewNodeId={previewNodeId}
        previewProgressRef={previewProgressRef}
        onBackgroundClick={() => {
          setManualTargetId(null);
          setInspectedNodeId(null);
          setIsDrawerOpen(false);
          if (previewPlayer) previewPlayer.pauseVideo();
        }}
      />

      {/* Floating HUD - Top Left - Logo & Tabs */}
      <div className="absolute top-6 left-6 z-10 w-80">
        <div className="bg-black border-2 border-white p-6 relative">
          <div className="absolute top-1 right-2 text-[8px] font-mono text-white/50">+++ SYS.01</div>
          <div className="absolute bottom-1 right-2 text-[8px] font-mono text-white/50">[ ///// ]</div>
          
          <h1 className="text-4xl font-black tracking-tighter uppercase mb-6" style={{ fontFamily: 'monospace', letterSpacing: '-0.05em' }}>
            WAVE<span className="text-white/50">.FM</span>
          </h1>
          <div className="flex gap-1 border-t-2 border-white pt-4">
            <button 
              className={`flex-1 py-2 text-[10px] font-bold tracking-widest uppercase border-2 transition-all ${activeTab === 'discover' ? 'bg-white text-black border-white' : 'text-white border-transparent hover:border-white/50'}`}
              onClick={() => {
                setActiveTab('discover');
                setDestTrackId("");
                setDestSearchQuery("");
                setHighlightedPathIds([]);
                setJourneyState("IDLE");
                setManualTargetId(null);
                setInspectedNodeId(null);
              }}
              style={{ fontFamily: 'monospace' }}
            >
              DISCOVER
            </button>
            <button 
              className={`flex-1 py-2 text-[10px] font-bold tracking-widest uppercase border-2 transition-all ${activeTab === 'interpolate' ? 'bg-white text-black border-white' : 'text-white border-transparent hover:border-white/50'}`}
              onClick={() => {
                setActiveTab('interpolate');
                setSourceTrackId(currentTrack.id);
                setSourceSearchQuery(`${currentTrack.title.toUpperCase()} // ${currentTrack.artist.toUpperCase()}`);
                setDestTrackId("");
                setDestSearchQuery("");
                setHighlightedPathIds([]);
                setInterpolateFocusMode("DESTINATION");
                setJourneyState("IDLE");
                setInspectedNodeId(null);
              }}
              style={{ fontFamily: 'monospace' }}
            >
              ROUTE
            </button>
            <button 
              className={`flex-1 py-2 text-[10px] font-bold tracking-widest uppercase border-2 transition-all ${activeTab === 'expedition' ? 'bg-white text-black border-white' : 'text-white border-transparent hover:border-white/50'}`}
              onClick={() => {
                setActiveTab('expedition');
                setDestTrackId("");
                setDestSearchQuery("");
                setHighlightedPathIds([]);
                setJourneyState("IDLE");
                setManualTargetId(null);
                setInspectedNodeId(null);
              }}
              style={{ fontFamily: 'monospace' }}
            >
              EXPEDITION
            </button>
          </div>
        </div>
      </div>

      {/* Floating HUD - Left Side Controls */}
      <div className="absolute top-52 left-6 z-10 w-80 space-y-4">
        {activeTab === "interpolate" && (
          <div className="bg-black border-2 border-white p-6 relative">
            <div className="absolute top-1 right-2 text-[8px] font-mono text-white/50">+++ SYS.02</div>
            <div className="absolute bottom-1 right-2 text-[8px] font-mono text-white/50">[ ///// ]</div>

            <div className="space-y-6 relative" ref={searchContainerRef}>
              <div className="space-y-4">
                <div>
                  <Label className={`text-[10px] tracking-widest uppercase font-bold transition-colors ${interpolateFocusMode === 'SOURCE' ? 'text-white' : 'text-white/50'}`} style={{ fontFamily: 'monospace' }}>[ FROM ] SOURCE_NODE</Label>
                  <div className="relative">
                    <Input 
                      placeholder="SEARCH_DB..." 
                      value={sourceSearchQuery}
                      onChange={(e) => {
                        setSourceSearchQuery(e.target.value);
                        if (sourceTrackId) setSourceTrackId("");
                      }}
                      onFocus={() => {
                        setInterpolateFocusMode("SOURCE");
                        if (searchResults.length > 0) setIsDropdownOpen(true);
                      }}
                      className={`bg-black border-2 transition-colors text-white rounded-none mt-1 font-mono uppercase pr-8 ${interpolateFocusMode === 'SOURCE' ? 'border-white' : 'border-white/30'}`}
                      disabled={isJourneyLocked}
                    />
                  </div>
                </div>

                <div>
                  <Label className={`text-[10px] tracking-widest uppercase font-bold transition-colors ${interpolateFocusMode === 'DESTINATION' ? 'text-white' : 'text-white/50'}`} style={{ fontFamily: 'monospace' }}>[ TO ] DESTINATION_NODE</Label>
                  <div className="relative">
                    <Input 
                      placeholder="SEARCH_DB..." 
                      value={destSearchQuery}
                      onChange={(e) => {
                        setDestSearchQuery(e.target.value);
                        if (destTrackId) setDestTrackId("");
                      }}
                      onFocus={() => {
                        setInterpolateFocusMode("DESTINATION");
                        if (searchResults.length > 0) setIsDropdownOpen(true);
                      }}
                      className={`bg-black border-2 transition-colors text-white rounded-none mt-1 font-mono uppercase pr-8 ${interpolateFocusMode === 'DESTINATION' ? 'border-white' : 'border-white/30'}`}
                      disabled={isJourneyLocked}
                    />
                    {destTrackId && !isJourneyLocked && (
                      <button 
                        onClick={() => {
                          setDestTrackId("");
                          setDestSearchQuery("");
                          setHighlightedPathIds([]);
                          setJourneyState("IDLE");
                        }}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                        title="Clear Destination"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
                {journeyState === "PREVIEW" && (
                  <div className="mt-3 flex gap-2">
                    <button 
                      onClick={() => {
                        setManualTargetId(null);
                        setInspectedNodeId(null);
                        if (sourceTrackId !== currentTrack.id) {
                          const sourceNode = graphData.nodes.find((n: any) => n.id === sourceTrackId);
                          if (sourceNode) executeJump(sourceNode);
                        } else {
                          setJourneyState("LOCKED");
                        }
                      }}
                      className="flex-1 bg-white border-2 border-white text-black hover:bg-transparent hover:text-white text-[10px] font-bold font-mono tracking-widest uppercase py-2 transition-all"
                    >
                      [ INITIATE_EXPEDITION ]
                    </button>
                    <button 
                      onClick={() => {
                        setDestTrackId("");
                        setDestSearchQuery("");
                        setHighlightedPathIds([]);
                        setJourneyState("IDLE");
                      }}
                      className="w-10 bg-transparent border-2 border-dashed border-red-500/50 text-red-500/80 hover:bg-red-500/10 hover:border-red-500 hover:text-red-500 flex items-center justify-center transition-all"
                      title="Clear"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                )}
                {journeyState === "LOCKED" && (
                  <div className="mt-3">
                    <button 
                      onClick={() => {
                        setDestTrackId("");
                        setDestSearchQuery("");
                        setHighlightedPathIds([]);
                        setJourneyState("IDLE");
                      }}
                      className="w-full bg-transparent border-2 border-dashed border-red-500/50 text-red-500/80 hover:bg-red-500/10 hover:border-red-500 hover:text-red-500 text-[10px] font-bold font-mono tracking-widest uppercase py-2 transition-all"
                    >
                      [ ABORT_EXPEDITION ]
                    </button>
                  </div>
                )}
                
                {isDropdownOpen && searchResults.length > 0 && (
                  <div className="absolute top-[130px] left-0 right-0 bg-black border-2 border-white z-50 max-h-60 overflow-y-auto">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="p-3 border-b-2 border-white/20 last:border-b-0 hover:bg-white hover:text-black cursor-pointer font-mono"
                        onClick={() => {
                          isInternalSearchUpdate.current = true;
                          const nodeStr = `${result.title.toUpperCase()} // ${result.artist.toUpperCase()}`;
                          if (interpolateFocusMode === "SOURCE") {
                            setSourceTrackId(result.id);
                            setSourceSearchQuery(nodeStr);
                            if (destTrackId) setJourneyState("PREVIEW");
                          } else {
                            setDestTrackId(result.id);
                            setDestSearchQuery(nodeStr);
                            if (sourceTrackId) setJourneyState("PREVIEW");
                          }
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className="font-bold text-xs truncate">{result.title.toUpperCase()}</div>
                        <div className="text-[10px] tracking-widest opacity-70 truncate uppercase">{result.artist}</div>
                      </div>
                    ))}
                  </div>
                )}
              <div className="pt-2 border-t-2 border-white/20 relative">
                {isJourneyLocked && (
                  <div className="absolute inset-0 z-10 bg-black/80 backdrop-blur-sm flex items-center justify-center border border-white/20">
                    <span className="text-[10px] font-mono tracking-widest uppercase text-white animate-pulse">[ LOCKED_IN_TRANSIT ]</span>
                  </div>
                )}
                <div className={`transition-opacity duration-300 ${isJourneyLocked ? 'opacity-30' : 'opacity-100'}`}>
                  <div className="flex justify-between mb-4">
                    <Label className="text-[10px] tracking-widest uppercase text-white font-bold" style={{ fontFamily: 'monospace' }}>BRIDGE_DISTANCE</Label>
                    <span className="text-[10px] text-white font-mono">[{nSteps[0]}_LY]</span>
                  </div>
                  <Slider
                    min={1}
                    max={10}
                    step={1}
                    value={nSteps}
                    onValueChange={(val) => { if (!isJourneyLocked) setNSteps(val); }}
                    className={`w-full ${isJourneyLocked ? 'pointer-events-none' : ''}`}
                    disabled={isJourneyLocked}
                  />
                </div>
              </div>
                {/* Bridge Relay Status */}
                {activeTab === "interpolate" && highlightedPathIds.length > 0 && (
                  <div className="flex items-center justify-between mt-6 pt-3 border-t border-white/20">
                    <div className="flex gap-1">
                      {Array.from({ length: nSteps[0] }).map((_, i) => {
                        const established = Math.max(0, highlightedPathIds.length - 2);
                        return (
                          <div 
                            key={i} 
                            className={`h-2 w-3 border border-white ${i < established ? 'bg-white' : 'bg-transparent'}`} 
                          />
                        );
                      })}
                    </div>
                    <div className="text-[8px] text-white/70 font-mono tracking-widest uppercase">
                      {Math.max(0, highlightedPathIds.length - 2) === nSteps[0] 
                        ? "LINK OPTIMAL" 
                        : "SIGNAL DEGRADED"}
                    </div>
                  </div>
                )}
                            </div>
          </div>
        )}
        
        {activeTab === "expedition" && (
          <div className="bg-black border-2 border-white p-6 relative">
            <div className="absolute top-1 right-2 text-[8px] font-mono text-white/50">+++ SYS.04</div>
            
            {(() => {
              const isDocked = beacons.some(b => b.id === currentTrack.id);
              
              if (!isDocked) {
                return (
                  <div className="space-y-6">
                    <Label className="text-[10px] tracking-widest uppercase font-bold text-red-500 block animate-pulse" style={{ fontFamily: 'monospace' }}>
                      [ ERROR: OUT OF RANGE ]
                    </Label>
                    <div className="text-[10px] text-white/70 font-mono">
                      MUST BE DOCKED AT A BEACON TO INITIATE EXPEDITION.
                    </div>
                    <Button 
                      className="w-full bg-white text-black hover:bg-white/80 rounded-none font-bold tracking-widest text-[10px]"
                      onClick={jumpToNearestBeacon}
                      style={{ fontFamily: 'monospace' }}
                    >
                      JUMP TO NEAREST BEACON
                    </Button>
                  </div>
                );
              }
              
              if (!expeditionTargetId) {
                return (
                  <div className="space-y-6">
                    <Label className="text-[10px] tracking-widest uppercase font-bold text-green-400 block" style={{ fontFamily: 'monospace' }}>
                      [ DOCKED AT BEACON ]
                    </Label>
                    <Button 
                      className="w-full bg-red-600 text-white hover:bg-red-700 rounded-none font-bold tracking-widest text-[10px]"
                      onClick={generateMission}
                      disabled={isGeneratingMission}
                      style={{ fontFamily: 'monospace' }}
                    >
                      {isGeneratingMission ? "SCANNING..." : "SCAN FOR ANOMALIES"}
                    </Button>
                  </div>
                );
              }
              
              const targetBeacon = beacons.find(b => b.id === expeditionTargetId);
              return (
                <div className="space-y-4">
                  <Label className="text-[10px] tracking-widest uppercase font-bold text-red-500 block animate-pulse" style={{ fontFamily: 'monospace' }}>
                    [ ANOMALY DETECTED ]
                  </Label>
                  <div className="text-[10px] text-white font-mono border border-white/30 p-2">
                    <div className="text-white/50 mb-1">TARGET_SIGNAL:</div>
                    <div className="truncate">{targetBeacon?.title}</div>
                    <div className="text-white/50 truncate">{"// " + targetBeacon?.artist}</div>
                    <div className="mt-3 text-white/50">OPTIMAL_PATH:</div>
                    <div className="text-green-400">[{expeditionParScore} HOPS]</div>
                  </div>
                  <Button 
                    className="w-full bg-white text-black hover:bg-white/80 rounded-none font-bold tracking-widest text-[10px]"
                    onClick={() => setExpeditionTargetId(null)}
                    style={{ fontFamily: 'monospace' }}
                  >
                    ABORT EXPEDITION
                  </Button>
                </div>
              );
            })()}
          </div>
        )}
        
        {/* Global Controls - Gravity Slider */}
        {activeTab !== "expedition" && (
          <div className="bg-black border-2 border-white p-6 relative overflow-hidden">
            {isJourneyLocked && (
              <div className="absolute inset-0 z-10 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <span className="text-[10px] font-mono tracking-widest uppercase text-white animate-pulse mb-1">[ LATENT_SPACE_LOCKED ]</span>
                <span className="text-[8px] font-mono tracking-widest uppercase text-white/50 text-center">FINISH OR ABORT EXPEDITION<br/>TO UNLOCK</span>
              </div>
            )}
            <div className={`transition-opacity duration-300 ${isJourneyLocked ? 'opacity-30' : 'opacity-100'}`}>
              <div className="absolute top-1 right-2 text-[8px] font-mono text-white/50">+++ SYS.03</div>
              <Label className="text-[10px] tracking-widest uppercase text-white font-bold mb-4 block" style={{ fontFamily: 'monospace' }}>GRAVITY_MODIFIER [AUDIO:LYRICS]</Label>
              <div className="pt-2">
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={audioLyricsValue}
                  onValueChange={(val) => {
                    if (!isJourneyLocked) {
                      setAudioLyricsValue(val);
                      setLiveWeight(val[0] / 100);
                    }
                  }}
                  onValueCommit={(val) => {
                    if (!isJourneyLocked) setCommittedAudioWeight(val[0] / 100);
                  }}
                  className={`w-full ${isJourneyLocked ? 'pointer-events-none' : ''}`}
                  disabled={isJourneyLocked}
                />
              </div>
              <div className="flex justify-between text-[10px] tracking-widest uppercase text-white font-mono mt-4">
                <span>[AUDIO]</span>
                <span>[LYRIC]</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main & Preview YouTube Players (Hidden) */}
      <div className="hidden">
        {currentTrack.videoId && (
          <YouTube
            videoId={currentTrack.videoId}
            opts={{ width: '0', height: '0', playerVars: { autoplay: autoPlayNext ? 1 : 0 } }}
            onReady={(e) => setPlayer(e.target)}
            onStateChange={(e) => {
              setIsPlaying(e.data === 1);
              if (e.data === 0) { // ENDED
                setAutoPlayNext(true);
                // Auto-play next logic
                if (activeTab === "discover" || (activeTab === "interpolate" && journeyState !== "LOCKED")) {
                  const currentId = currentTrack.id;
                  const edges = graphData.links.filter((l: any) => 
                    (l.source?.id || l.source) === currentId
                  );
                  let nextEdge = edges.find((l: any) => {
                    const tid = typeof l.target === 'object' ? l.target.id : l.target;
                    return !playbackHistory.includes(tid);
                  });
                  if (!nextEdge && edges.length > 0) nextEdge = edges[0];
                  
                  if (nextEdge) {
                    const targetId = typeof nextEdge.target === 'object' ? nextEdge.target.id : nextEdge.target;
                    let actualTargetId = targetId;
                    if (manualTargetId) {
                      actualTargetId = manualTargetId;
                      setManualTargetId(null);
                    }
                    const targetNode = graphData.nodes.find((n: any) => n.id === actualTargetId);
                    if (targetNode) executeJump(targetNode);
                  }
                } else if (activeTab === "interpolate" && journeyState === "LOCKED") {
                   const idx = highlightedPathIds.indexOf(currentTrack.id);
                   if (idx !== -1 && idx < highlightedPathIds.length - 1) {
                     const targetId = highlightedPathIds[idx + 1];
                     const targetNode = graphData.nodes.find((n: any) => n.id === targetId) || ghostNodes.find(n => n.id === targetId);
                     if (targetNode) executeJump(targetNode);
                   }
                }
              }
            }}
          />
        )}
        {previewTrack?.videoId && (
          <YouTube
            videoId={previewTrack.videoId}
            opts={{ width: '0', height: '0', playerVars: { autoplay: 0 } }}
            onReady={(e) => setPreviewPlayer(e.target)}
            onStateChange={(e) => {
              setIsPreviewPlaying(e.data === 1);
            }}
          />
        )}
      </div>
      
      {/* Unified Context Panel */}
      <ContextPanel 
        currentTrack={currentTrack}
        previewTrack={previewNodeId ? previewTrack : null}
        previewProgressRef={previewProgressRef}
        playbackProgressRef={playbackProgressRef}
        trackDuration={trackDuration}
        previewDuration={previewDuration}
        isPlaying={isPlaying}
        isPreviewPlaying={isPreviewPlaying}
        onScrub={(prog, isPreview) => {
          const targetPlayer = isPreview ? previewPlayer : player;
          if (targetPlayer) {
            const dur = targetPlayer.getDuration();
            if (dur > 0) {
              targetPlayer.seekTo(prog * dur);
              // Eagerly update ref so UI doesn't jump back while buffering
              if (isPreview) previewProgressRef.current = prog;
              else playbackProgressRef.current = prog;
            }
          }
        }}
        onPlayToggle={(isPreview) => {
          if (isPreview) {
            if (isPreviewPlaying) {
              previewPlayer?.pauseVideo();
            } else {
              if (player) player.pauseVideo(); // Pause main audio when playing preview!
              previewPlayer?.playVideo();
            }
            setIsPreviewPlaying(!isPreviewPlaying);
          } else {
            if (isPlaying) player?.pauseVideo();
            else player?.playVideo();
            setIsPlaying(!isPlaying);
          }
        }}
        onClosePreview={() => {
          setPreviewNodeId(null);
          if (previewPlayer) previewPlayer.pauseVideo();
          setIsPreviewPlaying(false);
          // Optional: handle closing the drawer entirely if needed, 
          // but now ContextPanel just falls back to MAIN tab.
        }}
        onInitiateJump={(nodeId) => {
          // Find node in graphData
          const targetNode = graphData.nodes.find((n: any) => n.id === nodeId);
          if (targetNode) {
            executeJump(targetNode);
          }
        }}
        manualTargetId={manualTargetId}
        onClearManualTarget={() => setManualTargetId(null)}
      />
      
      <div className="crt absolute inset-0 z-[100] pointer-events-none"></div>
    </div>
  );
};

export default Index;