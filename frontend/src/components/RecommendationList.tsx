import { RecommendationCard } from "./RecommendationCard";
import { ScrollArea } from "./ui/scroll-area";

interface Track {
  id: string;
  title: string;
  artist: string;
  score: number;
}

interface RecommendationListProps {
  tracks: Track[];
  onTrackPlay: (trackId: string) => void;
}

export const RecommendationList = ({ tracks, onTrackPlay }: RecommendationListProps) => {
  return (
    <div className="bg-card border-2 border-foreground shadow-retro p-4 lg:h-full flex flex-col overflow-hidden">
      <h2 className="text-lg font-bold mb-4 text-foreground font-retro">RECOMMENDATIONS</h2>
      <div className="relative flex-1 min-h-0">
        {/* Top gradient overlay */}
        <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-card to-transparent pointer-events-none z-10" />
        
        <ScrollArea className="h-full">
          <div className="space-y-3 pr-4 py-1">
            {tracks.map((track) => (
              <RecommendationCard
                key={track.id}
                title={track.title}
                artist={track.artist}
                score={track.score}
                onPlay={() => onTrackPlay(track.id)}
              />
            ))}
          </div>
        </ScrollArea>
        
        {/* Bottom gradient overlay */}
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-card to-transparent pointer-events-none z-10" />
      </div>
    </div>
  );
};