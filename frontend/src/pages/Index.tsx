import { useState, useEffect, useRef } from "react";
import { CurrentTrack } from "@/components/CurrentTrack";
import { RecommendationList } from "@/components/RecommendationList";
import { BottomNavigation } from "@/components/BottomNavigation";
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
  const [recommendations, setRecommendations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Interpolate state
  const [destTrackId, setDestTrackId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [nSteps, setNSteps] = useState([3]);

  // Handle clicking outside to close dropdown
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

  const fetchRecommendations = async (queryId?: string, weightValue?: number) => {
    setIsLoading(true);
    try {
      const weight = (weightValue ?? audioLyricsValue[0]) / 100;
      let url = `http://localhost:8000/api/recommend?audio_weight=${weight}`;
      if (queryId) {
        url += `&query_id=${queryId}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error("API error");
      const data = await response.json();
      
      setCurrentTrack(data.query_track);
      setRecommendations(data.recommendations);
    } catch (error) {
      console.error("Failed to fetch recommendations", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInterpolation = async (weightValue?: number) => {
    if (!currentTrack.id || !destTrackId) return;
    setIsLoading(true);
    try {
      const weight = (weightValue ?? audioLyricsValue[0]) / 100;
      let url = `http://localhost:8000/api/interpolate?source_id=${currentTrack.id}&dest_id=${destTrackId}&n_steps=${nSteps[0]}&audio_weight=${weight}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("API error");
      const data = await response.json();
      
      setRecommendations(data.interpolated_tracks);
    } catch (error) {
      console.error("Failed to fetch interpolation", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Search effect
  useEffect(() => {
    if (!searchQuery || destTrackId) {
      setSearchResults([]);
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
  }, [searchQuery, destTrackId]);

  useEffect(() => {
    if (activeTab === "discover") {
      fetchRecommendations(currentTrack.id || undefined);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const handleAudioLyricsChange = (value: number[]) => {
    setAudioLyricsValue(value);
    if (activeTab === "discover" && currentTrack.id) {
        fetchRecommendations(currentTrack.id, value[0]);
    } else if (activeTab === "interpolate" && destTrackId) {
        fetchInterpolation(value[0]);
    }
  };

  const handleTrackPlay = (trackId: string) => {
    if (activeTab === "discover") {
      fetchRecommendations(trackId);
    } else {
      // In interpolate mode, just preview the track without wiping the queue
      const track = recommendations.find((t: any) => t.id === trackId);
      if (track) {
        setCurrentTrack({
          id: track.id,
          title: track.title,
          artist: track.artist,
          videoId: track.videoId,
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-background font-retro pb-20">
      {/* Header */}
      <div className="flex justify-end p-4">
        <h1 className="text-2xl font-bold text-foreground font-retro">wave.fm</h1>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 max-w-7xl mx-auto lg:items-start">
        {/* Left Panel - Current Track */}
        <div className="order-1 lg:order-1 flex flex-col gap-6">
          <CurrentTrack
            title={currentTrack.title}
            artist={currentTrack.artist}
            videoId={currentTrack.videoId}
            audioLyricsValue={audioLyricsValue}
            onAudioLyricsChange={handleAudioLyricsChange}
          />
          
          {activeTab === "interpolate" && (
            <div className="bg-card border-2 border-foreground shadow-retro p-4 font-retro space-y-4">
              <h2 className="text-lg font-bold text-foreground">INTERPOLATION</h2>
              <div className="space-y-2 relative" ref={searchContainerRef}>
                <Label>Destination Track</Label>
                <Input 
                  placeholder="Search for a song..." 
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (destTrackId) setDestTrackId("");
                  }}
                  onFocus={() => { if (searchResults.length > 0) setIsDropdownOpen(true); }}
                  className="font-sans border-2 border-foreground"
                />
                
                {isDropdownOpen && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border-2 border-foreground shadow-retro z-50 max-h-60 overflow-y-auto">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="p-2 border-b-2 border-foreground last:border-b-0 hover:bg-accent hover:text-accent-foreground cursor-pointer font-sans"
                        onClick={() => {
                          setDestTrackId(result.id);
                          setSearchQuery(`${result.title} - ${result.artist}`);
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className="font-bold text-sm truncate">{result.title}</div>
                        <div className="text-xs opacity-80 truncate">{result.artist}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="space-y-2 pt-2">
                <div className="flex justify-between">
                  <Label>Transition Steps: {nSteps[0]}</Label>
                </div>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={nSteps}
                  onValueChange={(val) => { setNSteps(val); if(destTrackId) fetchInterpolation(audioLyricsValue[0]); }}
                  className="w-full"
                />
              </div>
              
              <Button 
                onClick={() => fetchInterpolation()}
                disabled={isLoading || !destTrackId}
                className="w-full bg-primary hover:bg-accent text-primary-foreground border-2 border-foreground shadow-retro mt-2 font-bold"
              >
                {isLoading ? "GENERATING..." : "GENERATE TRANSITION"}
              </Button>
            </div>
          )}
        </div>

        {/* Right Panel - Recommendations */}
        <div className="order-2 lg:order-2 lg:self-stretch min-w-0 min-h-[500px] lg:min-h-0 flex flex-col">
          <RecommendationList
            tracks={recommendations}
            onTrackPlay={handleTrackPlay}
            title={activeTab === "discover" ? "RECOMMENDATIONS" : "TRANSITION PATH"}
          />
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
};

export default Index;