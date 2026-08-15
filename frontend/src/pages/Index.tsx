import { useState } from "react";
import { CurrentTrack } from "@/components/CurrentTrack";
import { RecommendationList } from "@/components/RecommendationList";
import { BottomNavigation } from "@/components/BottomNavigation";
import defaultCover from "@/assets/default-cover.jpg";

const Index = () => {
  const [audioLyricsValue, setAudioLyricsValue] = useState([50]);
  const [activeTab, setActiveTab] = useState<"discover" | "interpolate">("discover");

  // Mock data for current track
  const currentTrack = {
    title: "Shape Of You",
    artist: "Ed Sheeran",
    videoId: "JGwWNGJdvx8", // Shape of You YouTube video ID
  };

  // Mock data for recommendations
  const recommendations = [
    { id: "1", title: "Un Superhéroe", artist: "Denis Vega", score: 90 },
    { id: "2", title: "Yoga", artist: "Blaya", score: 90 },
    { id: "3", title: "Toda La Noche", artist: "Alok & Mario Bautista", score: 89 },
    { id: "4", title: "Rane", artist: "Anastasija Ražnatović", score: 89 },
    { id: "5", title: "Questions", artist: "Chris Brown", score: 89 },
    { id: "6", title: "Zver", artist: "Coby", score: 88 },
    { id: "7", title: "Soleil", artist: "Ol' Kainry", score: 88 },
  ];

  const handleTrackPlay = (trackId: string) => {
    console.log(`Playing track: ${trackId}`);
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
        <div className="order-1 lg:order-1">
          <CurrentTrack
            title={currentTrack.title}
            artist={currentTrack.artist}
            videoId={currentTrack.videoId}
            audioLyricsValue={audioLyricsValue}
            onAudioLyricsChange={setAudioLyricsValue}
          />
        </div>

        {/* Right Panel - Recommendations */}
        <div className="order-2 lg:order-2 lg:self-stretch min-h-0 [contain:size] overflow-hidden">
          <RecommendationList
            tracks={recommendations}
            onTrackPlay={handleTrackPlay}
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