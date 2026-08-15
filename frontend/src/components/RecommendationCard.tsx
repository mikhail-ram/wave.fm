import { Play } from "lucide-react";
import { Button } from "./ui/button";

interface RecommendationCardProps {
  title: string;
  artist: string;
  score: number;
  onPlay: () => void;
}

export const RecommendationCard = ({
  title,
  artist,
  score,
  onPlay,
}: RecommendationCardProps) => {
  // Calculate color from red (0%) to green (100%)
  // Red: hsl(0, 70%, 50%) -> Green: hsl(120, 70%, 40%)
  const hue = (score / 100) * 120; // 0 to 120 degrees
  const backgroundColor = `hsl(${hue}, 70%, 45%)`;
  
  return (
    <div className="bg-card border-2 border-foreground shadow-retro p-4 font-retro hover:shadow-[4px_4px_0px_hsl(var(--foreground))] transition-shadow mr-2 mb-2 max-w-[calc(100%-8px)]">
      <div className="flex items-center gap-3">
        <Button
          onClick={onPlay}
          size="sm"
          className="bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground border-2 border-foreground shadow-retro p-2 font-retro"
        >
          <Play className="h-3 w-3" />
        </Button>
        
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="text-sm font-bold text-foreground truncate">{title}</h3>
          <p className="text-xs text-muted-foreground truncate">{artist}</p>
        </div>
        
        <div 
          className="border-2 border-foreground px-2 py-1 text-xs font-bold font-retro text-white shrink-0"
          style={{ backgroundColor }}
        >
          {score}%
        </div>
      </div>
    </div>
  );
};