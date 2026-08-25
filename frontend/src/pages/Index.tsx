import { useState, useEffect, useRef } from "react";
import { CurrentTrack } from "@/components/CurrentTrack";
import { GraphCanvas } from "@/components/GraphCanvas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import YouTube from 'react-youtube';

const Index = () => {
  const [audioLyricsValue, setAudioLyricsValue] = useState([50]);
  const [committedAudioWeight, setCommittedAudioWeight] = useState(0.5);
  const [activeTab, setActiveTab] = useState<"discover" | "interpolate">("discover");
  
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

  // Poll YouTube progress without re-rendering React tree
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && player) {
      interval = setInterval(async () => {
        try {
          const currentTime = await player.getCurrentTime();
          const duration = await player.getDuration();
          if (duration > 0) {
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
  }, [isPlaying, player]);

  // Graph state
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  
  // Interpolate state
  const [sourceTrackId, setSourceTrackId] = useState("");
  const [destTrackId, setDestTrackId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [nSteps, setNSteps] = useState([10]);
  const [highlightedPathIds, setHighlightedPathIds] = useState<string[]>([]);
  const [ghostNodes, setGhostNodes] = useState<any[]>([]);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [liveWeight, setLiveWeight] = useState(0.5);

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
    }
  }, [activeTab, sourceTrackId, destTrackId, nSteps, committedAudioWeight]);

  // Search effect (debounced)
  const isInternalSearchUpdate = useRef(false);
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }
    if (isInternalSearchUpdate.current) {
      isInternalSearchUpdate.current = false;
      return;
    }
    
    const delayDebounceFn = setTimeout(() => {
      fetch(`http://localhost:8000/api/search?q=${encodeURIComponent(searchQuery)}`)
        .then(res => res.json())
        .then(data => {
          setSearchResults(data.results || []);
          setIsDropdownOpen(true);
        })
        .catch(err => console.error(err));
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleNodeClick = (node: any) => {
    setAutoPlayNext(true);
    setPlaybackHistory(prev => {
      if (!prev.includes(node.id)) {
        return [...prev, node.id];
      }
      return prev;
    });
    // Reset progress instantly to avoid flashing the old progress on the new edge
    playbackProgressRef.current = 0;
    if (progressBarRef.current) {
      progressBarRef.current.style.width = "0%";
    }
    
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
        // Planning Phase: updating the starting point
        setSourceTrackId(node.id);
      } else {
        // Route exists. Did they click on or off the path?
        if (!highlightedPathIds.includes(node.id)) {
          // Off-path! Abort the expedition instantly.
          setDestTrackId("");
          setSearchQuery("");
          setSourceTrackId(node.id);
        }
        // If on-path, currentTrack updates and journey logic handles the rest naturally.
      }
    }
  };

  const isJourneyActive = activeTab === "interpolate" && 
                          sourceTrackId && 
                          destTrackId && 
                          currentTrack.id !== sourceTrackId && 
                          currentTrack.id !== destTrackId;
                          
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
      />

      {/* Floating HUD - Top Left - Logo & Tabs */}
      <div className="absolute top-6 left-6 z-10 w-80">
        <div className="bg-black border-2 border-white p-6 relative">
          <div className="absolute top-1 right-2 text-[8px] font-mono text-white/50">+++ SYS.01</div>
          <div className="absolute bottom-1 right-2 text-[8px] font-mono text-white/50">[ ///// ]</div>
          
          <h1 className="text-4xl font-black tracking-tighter uppercase mb-6" style={{ fontFamily: 'monospace', letterSpacing: '-0.05em' }}>
            WAVE<span className="text-white/50">.FM</span>
          </h1>
          <div className="flex gap-2 border-t-2 border-white pt-4">
            <button 
              className={`flex-1 py-2 text-xs font-bold tracking-widest uppercase border-2 transition-all ${activeTab === 'discover' ? 'bg-white text-black border-white' : 'text-white border-transparent hover:border-white/50'}`}
              onClick={() => setActiveTab('discover')}
              style={{ fontFamily: 'monospace' }}
            >
              DISCOVER
            </button>
            <button 
              className={`flex-1 py-2 text-xs font-bold tracking-widest uppercase border-2 transition-all ${activeTab === 'interpolate' ? 'bg-white text-black border-white' : 'text-white border-transparent hover:border-white/50'}`}
              onClick={() => {
                setActiveTab('interpolate');
                setSourceTrackId(currentTrack.id);
              }}
              style={{ fontFamily: 'monospace' }}
            >
              INTERPOLATE
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
              <div>
                <Label className="text-[10px] tracking-widest uppercase text-white font-bold" style={{ fontFamily: 'monospace' }}>DESTINATION_NODE</Label>
                <div className="relative">
                  <Input 
                    placeholder="SEARCH_DB..." 
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (destTrackId) setDestTrackId("");
                    }}
                    onFocus={() => { if (searchResults.length > 0) setIsDropdownOpen(true); }}
                    className="bg-black border-2 border-white text-white rounded-none mt-2 font-mono uppercase pr-8"
                  />
                  {destTrackId && (
                    <button 
                      onClick={() => {
                        setDestTrackId("");
                        setSearchQuery("");
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                      title="Abort Expedition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  )}
                </div>
                {isJourneyActive && (
                  <div className="mt-3">
                    <button 
                      onClick={() => {
                        setDestTrackId("");
                        setSearchQuery("");
                      }}
                      className="w-full bg-transparent border-2 border-dashed border-red-500/50 text-red-500/80 hover:bg-red-500/10 hover:border-red-500 hover:text-red-500 text-[10px] font-mono tracking-widest uppercase py-2 transition-all"
                    >
                      [ ABORT_EXPEDITION ]
                    </button>
                  </div>
                )}
                
                {isDropdownOpen && searchResults.length > 0 && (
                  <div className="absolute top-[60px] left-0 right-0 bg-black border-2 border-white z-50 max-h-60 overflow-y-auto">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="p-3 border-b-2 border-white/20 last:border-b-0 hover:bg-white hover:text-black cursor-pointer font-mono"
                        onClick={() => {
                          isInternalSearchUpdate.current = true;
                          setDestTrackId(result.id);
                          setSearchQuery(`${result.title.toUpperCase()} // ${result.artist.toUpperCase()}`);
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className="font-bold text-xs truncate">{result.title.toUpperCase()}</div>
                        <div className="text-[10px] tracking-widest opacity-70 truncate uppercase">{result.artist}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="pt-2 border-t-2 border-white/20 relative">
                {isJourneyActive && (
                  <div className="absolute inset-0 z-10 bg-black/80 backdrop-blur-sm flex items-center justify-center border border-white/20">
                    <span className="text-[10px] font-mono tracking-widest uppercase text-white animate-pulse">[ LOCKED_IN_TRANSIT ]</span>
                  </div>
                )}
                <div className={`transition-opacity duration-300 ${isJourneyActive ? 'opacity-30' : 'opacity-100'}`}>
                  <div className="flex justify-between mb-4">
                    <Label className="text-[10px] tracking-widest uppercase text-white font-bold" style={{ fontFamily: 'monospace' }}>BRIDGE_DISTANCE</Label>
                    <span className="text-[10px] text-white font-mono">[{nSteps[0]}_LY]</span>
                  </div>
                  <Slider
                    min={1}
                    max={10}
                    step={1}
                    value={nSteps}
                    onValueChange={(val) => { if (!isJourneyActive) setNSteps(val); }}
                    className={`w-full ${isJourneyActive ? 'pointer-events-none' : ''}`}
                    disabled={isJourneyActive}
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

        {/* Global Controls - Gravity Slider */}
        <div className="bg-black border-2 border-white p-6 relative overflow-hidden">
          {isJourneyActive && (
            <div className="absolute inset-0 z-10 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
              <span className="text-[10px] font-mono tracking-widest uppercase text-white animate-pulse mb-1">[ LATENT_SPACE_LOCKED ]</span>
              <span className="text-[8px] font-mono tracking-widest uppercase text-white/50 text-center">FINISH OR ABORT EXPEDITION<br/>TO UNLOCK</span>
            </div>
          )}
          <div className={`transition-opacity duration-300 ${isJourneyActive ? 'opacity-30' : 'opacity-100'}`}>
            <div className="absolute top-1 right-2 text-[8px] font-mono text-white/50">+++ SYS.03</div>
            <Label className="text-[10px] tracking-widest uppercase text-white font-bold mb-4 block" style={{ fontFamily: 'monospace' }}>GRAVITY_MODIFIER [AUDIO:LYRICS]</Label>
            <div className="pt-2">
              <Slider
                min={0}
                max={100}
                step={1}
                value={audioLyricsValue}
                onValueChange={(val) => {
                  if (!isJourneyActive) {
                    setAudioLyricsValue(val);
                    setLiveWeight(val[0] / 100);
                  }
                }}
                onValueCommit={(val) => {
                  if (!isJourneyActive) setCommittedAudioWeight(val[0] / 100);
                }}
                className={`w-full ${isJourneyActive ? 'pointer-events-none' : ''}`}
                disabled={isJourneyActive}
              />
            </div>
            <div className="flex justify-between text-[10px] tracking-widest uppercase text-white font-mono mt-4">
              <span>[AUDIO]</span>
              <span>[LYRIC]</span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating HUD - Bottom Center - Player */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[400px]">
        <div className="bg-black border-2 border-white p-4 relative">
          <div className="absolute top-1 left-2 text-[8px] font-mono text-white/50">+++ TX.OUT</div>
          <div className="text-[10px] tracking-widest uppercase text-white font-bold mb-3 text-center cyber-flicker" style={{ fontFamily: 'monospace' }}>
            NOW_TRANSMITTING <span className="animate-pulse">_</span>
          </div>
          {currentTrack.videoId ? (
            <div className="border-2 border-white pointer-events-auto p-4 flex flex-col gap-4">
              <div className="flex justify-between items-center pb-3">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="font-bold text-xs truncate uppercase text-white font-mono">{currentTrack.title}</div>
                  <div className="text-[10px] tracking-widest text-white/50 truncate uppercase font-mono mt-1">{currentTrack.artist}</div>
                </div>
                <div className="text-[10px] font-mono whitespace-nowrap text-white/80">
                  {isPlaying ? '[ PLAYING ]' : '[ PAUSED ]'}
                </div>
              </div>
              
              <div className="h-0.5 bg-white/20 w-full relative -mt-2 mb-1">
                <div 
                  ref={progressBarRef}
                  className="absolute top-0 left-0 h-full bg-white transition-all duration-100 ease-linear"
                  style={{ width: '0%' }}
                ></div>
              </div>
              
              <div className="flex justify-between gap-2">
                <button 
                  className={`flex-1 py-2 border-2 border-white font-bold tracking-widest text-xs uppercase font-mono transition-colors ${isPlaying ? 'bg-white text-black' : 'bg-black text-white hover:bg-white/10'}`}
                  onClick={() => {
                    if (isPlaying) {
                      player?.pauseVideo();
                    } else {
                      player?.playVideo();
                    }
                  }}
                >
                  {isPlaying ? 'PAUSE' : 'PLAY'}
                </button>
              </div>

              {/* Hidden YouTube Player to drive audio */}
              <div className="hidden">
                <YouTube
                  videoId={currentTrack.videoId}
                  opts={{ width: '0', height: '0', playerVars: { autoplay: autoPlayNext ? 1 : 0 } }}
                  onReady={(e) => setPlayer(e.target)}
                  onStateChange={(e) => {
                    setIsPlaying(e.data === 1);
                    if (e.data === 0) { // ENDED
                      setAutoPlayNext(true);
                      // Auto-play next logic
                      if (activeTab === "discover" && graphData.links.length > 0) {
                        const currentId = currentTrack.id;
                        // Find the first edge that is NOT in history
                        const edges = graphData.links.filter((l: any) => 
                          (l.source?.id || l.source) === currentId
                        );
                        let nextEdge = edges.find((l: any) => {
                          const tid = typeof l.target === 'object' ? l.target.id : l.target;
                          return !playbackHistory.includes(tid);
                        });
                        
                        // Fallback to absolute closest if history exhausts all 5 edges
                        if (!nextEdge && edges.length > 0) nextEdge = edges[0];
                        
                        if (nextEdge) {
                          const targetId = typeof nextEdge.target === 'object' ? nextEdge.target.id : nextEdge.target;
                          const targetNode = graphData.nodes.find((n: any) => n.id === targetId);
                          if (targetNode) {
                            handleNodeClick(targetNode);
                          }
                        }
                      } else if (activeTab === "interpolate") {
                         // Interpolate mode next track
                         const idx = highlightedPathIds.indexOf(currentTrack.id);
                         if (idx !== -1 && idx < highlightedPathIds.length - 1) {
                           const targetId = highlightedPathIds[idx + 1];
                           const targetNode = graphData.nodes.find((n: any) => n.id === targetId) || ghostNodes.find(n => n.id === targetId);
                           if (targetNode) {
                             handleNodeClick(targetNode);
                           }
                         }
                      }
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="h-[100px] flex items-center justify-center border-2 border-white border-dashed bg-black">
              <span className="text-white text-xs tracking-widest uppercase font-mono">NO_SIGNAL_DETECTED</span>
            </div>
          )}
        </div>
      </div>
      <div className="crt absolute inset-0 z-[100] pointer-events-none"></div>
    </div>
  );
};

export default Index;