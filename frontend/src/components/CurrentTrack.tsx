import { Slider } from "./ui/slider";

interface CurrentTrackProps {
  title: string;
  artist: string;
  videoId: string;
  audioLyricsValue: number[];
  onAudioLyricsChange: (value: number[]) => void;
}

export const CurrentTrack = ({
  title,
  artist,
  videoId,
  audioLyricsValue,
  onAudioLyricsChange,
}: CurrentTrackProps) => {
  return (
    <div className="bg-card border-2 border-foreground shadow-retro p-6 font-retro flex flex-col">
      {/* YouTube Embed */}
      <div className="aspect-video bg-secondary border-2 border-foreground shadow-retro mb-4 overflow-hidden flex-shrink-0">
        <iframe
          width="100%"
          height="100%"
          src={`https://www.youtube.com/embed/${videoId}`}
          title={`${title} by ${artist}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
      
      {/* Track Info */}
      <div className="mb-4 flex-shrink-0">
        <h2 className="text-lg font-bold mb-1 text-foreground">{title}</h2>
        <p className="text-muted-foreground">{artist}</p>
      </div>
      
      {/* Audio ←→ Lyrics Slider */}
      <div className="space-y-2 mt-auto">
        <label className="text-sm font-bold text-foreground font-retro">
          Audio ←→ Lyrics
        </label>
        <Slider
          value={audioLyricsValue}
          onValueChange={onAudioLyricsChange}
          max={100}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground font-retro">
          <span>Audio</span>
          <span>Lyrics</span>
        </div>
      </div>
    </div>
  );
};