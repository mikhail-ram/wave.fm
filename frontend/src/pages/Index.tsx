import { useState, useEffect, useRef } from "react";
import { CurrentTrack } from "@/components/CurrentTrack";
import { GraphCanvas } from "@/components/GraphCanvas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const Index = () => {
  const [audioLyricsValue, setAudioLyricsValue] = useState([50]);
  const [activeTab, setActiveTab] = useState<"discover" | "interpolate">("discover");
  
  const [currentTrack, setCurrentTrack] = useState({
    id: "",
    title: "Loading...",
    artist: "Loading...",
    videoId: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  // Graph state
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  
  // Interpolate state
  const [sourceTrackId, setSourceTrackId] = useState("");
  const [destTrackId, setDestTrackId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [nSteps, setNSteps] = useState([3]);
  const [highlightedPathIds, setHighlightedPathIds] = useState<string[]>([]);
  const [ghostNodes, setGhostNodes] = useState<any[]>([]);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch massive graph data on mount
  useEffect(() => {
    fetch("http://localhost:8000/api/graph")
      .then(res => res.json())
      .then(data => {
        setGraphData(data);
        if (data.nodes.length > 0) {
          const first = data.nodes[0];
          setCurrentTrack({
            id: first.id,
            title: first.title,
            artist: first.artist,
            videoId: first.videoId
          });
          setSourceTrackId(first.id);
        }
      })
      .catch(err => console.error("Failed to load graph", err));
  }, []);

  const fetchInterpolation = async () => {
    if (!sourceTrackId || !destTrackId) return;
    setIsLoading(true);
    setHighlightedPathIds([]);
    
    try {
      const weight = audioLyricsValue[0] / 100;
      const url = `http://localhost:8000/api/interpolate?source_id=${sourceTrackId}&dest_id=${destTrackId}&n_steps=${nSteps[0]}&audio_weight=${weight}`;
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
    setCurrentTrack({
      id: node.id,
      title: node.title,
      artist: node.artist,
      videoId: node.videoId,
    });
    
    if (activeTab === "discover") {
      setSourceTrackId(node.id);
      setHighlightedPathIds([]);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-sans text-white">
      {/* 3D Physics Graph Canvas */}
      <GraphCanvas
        graphData={graphData}
        audioWeight={audioLyricsValue[0] / 100}
        onNodeClick={handleNodeClick}
        selectedNodeId={currentTrack.id}
        sourceNodeId={activeTab === "interpolate" ? sourceTrackId : undefined}
        destNodeId={activeTab === "interpolate" ? destTrackId : undefined}
        highlightedPathIds={activeTab === "interpolate" ? highlightedPathIds : []}
        ghostNodes={ghostNodes}
      />

      {/* Floating HUD - Top Left - Logo & Tabs */}
      <div className="absolute top-6 left-6 z-10 w-80">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
          <h1 className="text-3xl font-bold tracking-widest uppercase mb-6" style={{ fontFamily: 'system-ui, sans-serif' }}>wave.fm</h1>
          <div className="flex gap-2 bg-black/40 p-1 rounded-lg">
            <button 
              className={`flex-1 py-2 text-xs font-bold tracking-widest uppercase rounded-md transition-all ${activeTab === 'discover' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
              onClick={() => setActiveTab('discover')}
            >
              Discover
            </button>
            <button 
              className={`flex-1 py-2 text-xs font-bold tracking-widest uppercase rounded-md transition-all ${activeTab === 'interpolate' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
              onClick={() => setActiveTab('interpolate')}
            >
              Interpolate
            </button>
          </div>
        </div>
      </div>

      {/* Floating HUD - Left Side Controls */}
      <div className="absolute top-52 left-6 z-10 w-80 space-y-4">
        {activeTab === "interpolate" && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="space-y-4 relative" ref={searchContainerRef}>
              <div>
                <Label className="text-[10px] tracking-widest uppercase text-white/50">Destination Star</Label>
                <Input 
                  placeholder="Search galaxy..." 
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (destTrackId) setDestTrackId("");
                  }}
                  onFocus={() => { if (searchResults.length > 0) setIsDropdownOpen(true); }}
                  className="bg-black/40 border-white/20 text-white placeholder:text-white/30 mt-2"
                />
                
                {isDropdownOpen && searchResults.length > 0 && (
                  <div className="absolute top-[60px] left-0 right-0 bg-black/80 backdrop-blur-xl border border-white/20 rounded-lg z-50 max-h-60 overflow-y-auto">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="p-3 border-b border-white/10 last:border-b-0 hover:bg-white/10 cursor-pointer"
                        onClick={() => {
                          isInternalSearchUpdate.current = true;
                          setDestTrackId(result.id);
                          setSearchQuery(`${result.title.toUpperCase()} / ${result.artist.toUpperCase()}`);
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className="font-serif text-sm truncate">{result.title}</div>
                        <div className="text-[10px] tracking-widest text-white/50 truncate uppercase">{result.artist}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="pt-2">
                <div className="flex justify-between mb-2">
                  <Label className="text-[10px] tracking-widest uppercase text-white/50">Bridge Distance</Label>
                  <span className="text-[10px] text-white/50">{nSteps[0]} LY</span>
                </div>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={nSteps}
                  onValueChange={(val) => setNSteps(val)}
                  className="w-full"
                />
              </div>
              
              <Button 
                onClick={() => fetchInterpolation()}
                disabled={isLoading || !destTrackId}
                className="w-full bg-white text-black hover:bg-white/90 font-bold tracking-widest text-xs uppercase h-10 mt-4"
              >
                {isLoading ? "CALCULATING..." : "GENERATE BRIDGE"}
              </Button>
            </div>
          </div>
        )}

        {/* Global Controls - Gravity Slider */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
          <Label className="text-[10px] tracking-widest uppercase text-white/50">Gravity Modifier (Audio vs Lyrics)</Label>
          <div className="pt-2">
            <Slider
              min={0}
              max={100}
              step={1}
              value={audioLyricsValue}
              onValueChange={setAudioLyricsValue}
              className="w-full"
            />
          </div>
          <div className="flex justify-between text-[10px] tracking-widest uppercase text-white/40">
            <span>Audio Pull</span>
            <span>Lyrical Pull</span>
          </div>
        </div>
      </div>

      {/* Floating HUD - Bottom Center - Player */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[400px]">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl">
          <div className="text-[10px] tracking-widest uppercase text-white/50 mb-3 text-center">NOW TRANSMITTING</div>
          {currentTrack.videoId ? (
            <div className="rounded-xl overflow-hidden pointer-events-auto h-[100px]">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${currentTrack.videoId}?autoplay=1&controls=1`}
                title={currentTrack.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          ) : (
            <div className="h-[100px] flex items-center justify-center bg-black/40 rounded-xl">
              <span className="text-white/30 text-xs tracking-widest uppercase">No Signal</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;