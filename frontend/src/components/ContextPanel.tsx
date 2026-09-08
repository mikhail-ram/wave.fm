import React, { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { RetroMarquee } from './RetroMarquee';
import { AlbumArt } from './AlbumArt';

export interface TrackData {
  id: string;
  title: string;
  artist: string;
  videoId: string;
}

interface ContextPanelProps {
  currentTrack: TrackData | null;
  previewTrack: TrackData | null;
  playbackProgressRef?: React.MutableRefObject<number>;
  previewProgressRef?: React.MutableRefObject<number>;
  trackDuration?: number;
  previewDuration?: number;
  isPlaying: boolean;
  isPreviewPlaying: boolean;
  onScrub: (progress: number, isPreview: boolean) => void;
  onPlayToggle: (isPreview: boolean) => void;
  onClosePreview?: () => void;
  onInitiateJump?: (nodeId: string) => void;
  manualTargetId?: string | null;
  onClearManualTarget?: () => void;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  currentTrack,
  previewTrack,
  playbackProgressRef,
  previewProgressRef,
  trackDuration = 0,
  previewDuration = 0,
  isPlaying,
  isPreviewPlaying,
  onScrub,
  onPlayToggle,
  onClosePreview,
  onInitiateJump,
  manualTargetId = null,
  onClearManualTarget
}) => {
  const [activeTab, setActiveTab] = useState<'MAIN' | 'PREVIEW'>('MAIN');
  const [lyrics, setLyrics] = useState<string>("Loading lyrics...");
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [uiProgress, setUiProgress] = useState(0);

  // Auto-switch to preview tab when a preview is opened
  useEffect(() => {
    if (previewTrack) {
      setActiveTab('PREVIEW');
    } else {
      setActiveTab('MAIN');
    }
  }, [previewTrack]);

  const isPreviewTab = activeTab === 'PREVIEW';
  const activeTrack = isPreviewTab ? previewTrack : currentTrack;
  const activeDuration = isPreviewTab ? previewDuration : trackDuration;
  const activeIsPlaying = isPreviewTab ? isPreviewPlaying : isPlaying;

  // Decoupled UI polling loop
  useEffect(() => {
    const interval = setInterval(() => {
      if (isScrubbing) return;
      const ref = isPreviewTab ? previewProgressRef : playbackProgressRef;
      if (ref) setUiProgress(ref.current || 0);
    }, 100);
    return () => clearInterval(interval);
  }, [isPreviewTab, previewProgressRef, playbackProgressRef, isScrubbing]);

  // Fetch Lyrics when active track changes
  useEffect(() => {
    let active = true;
    if (activeTrack?.id) {
      setLyrics("Loading lyrics...");
      fetch(`http://localhost:8000/api/track/${activeTrack.id}`)
        .then(res => res.json())
        .then(data => {
          if (active) setLyrics(data.lyrics || "No lyrics available.");
        })
        .catch(err => {
          if (active) setLyrics("Failed to load lyrics.");
        });
    }
    return () => { active = false; };
  }, [activeTrack?.id]);

  if (!currentTrack && !previewTrack) return null;

  const displayProgress = isScrubbing ? localProgress : uiProgress;
  const currentSeconds = Math.floor(displayProgress * activeDuration);
  const remainingSeconds = Math.floor(activeDuration - currentSeconds);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div 
      className="absolute top-0 right-0 h-full w-[400px] bg-black/90 backdrop-blur-md border-l border-white/20 text-white shadow-2xl flex flex-col z-50 transition-transform duration-300 translate-x-0"
      style={{ boxShadow: '-10px 0 30px rgba(0,0,0,0.8)' }}
    >
      <div className="absolute top-1 left-2 text-[8px] font-mono text-white/50 pointer-events-none">+++ SYS.PANEL</div>
      
      {/* Tabs Header */}
      <div className="flex border-b border-white/20 mt-6 px-4">
        <button 
          onClick={() => setActiveTab('MAIN')}
          className={`flex-1 py-2 text-[10px] font-mono tracking-widest uppercase transition-colors border-b-2 ${!isPreviewTab ? 'border-white text-white font-bold' : 'border-transparent text-white/50 hover:text-white/80'}`}
        >
          NOW_TRANSMITTING
        </button>
        {previewTrack && (
          <button 
            onClick={() => setActiveTab('PREVIEW')}
            className={`flex-1 py-2 text-[10px] font-mono tracking-widest uppercase transition-colors border-b-2 ${isPreviewTab ? 'border-white text-white font-bold' : 'border-transparent text-white/50 hover:text-white/80'}`}
          >
            PREVIEW_NODE
          </button>
        )}
      </div>

      <div className="p-6 flex flex-col flex-1 overflow-hidden">
        {isPreviewTab && (
          <button 
            onClick={onClosePreview}
            className="absolute top-8 right-4 text-white/50 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}

        {activeTrack && (
          <>
            <div className="mb-6 text-left flex-shrink-0 mt-2 overflow-hidden">
              <RetroMarquee 
                text={activeTrack.title} 
                maxLength={22}
                className="text-white text-2xl font-bold tracking-tight"
              />
              <RetroMarquee 
                text={activeTrack.artist} 
                maxLength={28}
                className="text-gray-400 font-mono text-sm uppercase tracking-widest mt-1"
              />
            </div>
            
            {/* Album Art */}
            <div className={`w-full aspect-square bg-gray-900 mb-6 flex items-center justify-center overflow-hidden rounded-md border ${isPreviewTab ? 'border-dashed border-white/40' : 'border-white/20'} relative group flex-shrink-0`}>
              <AlbumArt 
                title={activeTrack.title}
                artist={activeTrack.artist}
                videoId={activeTrack.videoId}
                className={`w-full h-full opacity-90 transition-opacity duration-500 group-hover:opacity-100 ${isPreviewTab ? 'grayscale opacity-70' : ''}`}
              />
            </div>

            {/* Audio Scrubber & Controls */}
            <div className="mb-6 px-1 flex-shrink-0">
               <div className="flex space-x-2 mb-4">
                 <button 
                   onClick={() => onPlayToggle(isPreviewTab)}
                   className={`flex-1 font-bold font-mono tracking-widest text-[10px] uppercase py-2 transition-colors border-2 ${
                     isPreviewTab 
                      ? 'bg-transparent text-white border-white hover:bg-white hover:text-black' 
                      : 'bg-white text-black border-white hover:bg-gray-200'
                   }`}
                 >
                   {activeIsPlaying ? 'PAUSE' : 'PLAY'}
                 </button>
                 
                 {isPreviewTab && onInitiateJump && (
                   <button 
                     onClick={() => onInitiateJump(activeTrack.id)}
                     className="flex-1 font-bold font-mono tracking-widest text-[10px] uppercase py-2 transition-colors border-2 bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700"
                   >
                     OVERRIDE_JUMP
                   </button>
                 )}
               </div>
               
               <Slider 
                 value={[displayProgress * 100]} 
                 onValueChange={(v) => {
                   setIsScrubbing(true);
                   setLocalProgress(v[0] / 100);
                 }} 
                 onValueCommit={(v) => {
                   const finalProgress = v[0] / 100;
                   setUiProgress(finalProgress);
                   setIsScrubbing(false);
                   onScrub(finalProgress, isPreviewTab);
                 }}
                 max={100} 
                 step={0.1}
                 className="cursor-pointer"
               />
               <div className="flex justify-between mt-2 text-[10px] text-gray-500 font-mono">
                 <span>{formatTime(currentSeconds)}</span>
                 <span>-{formatTime(remainingSeconds)}</span>
               </div>
            </div>
            
            {!isPreviewTab && (
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/20">
                <div className="text-[10px] text-gray-500 font-mono tracking-widest uppercase text-center flex-1">
                  {manualTargetId 
                    ? "AUTOPILOT: MANUAL OVERRIDE" 
                    : "AUTOPILOT: SEEKING OPTIMAL MATCH"
                  }
                </div>
                {manualTargetId && onClearManualTarget && (
                  <button 
                    onClick={onClearManualTarget}
                    className="text-[8px] text-red-400 hover:text-red-300 font-mono tracking-widest border border-red-500/30 px-2 py-1 transition-colors ml-2"
                  >
                    [ CLEAR ]
                  </button>
                )}
              </div>
            )}

            {/* Lyrics Pane */}
            <ScrollArea className="flex-1 w-full rounded-md border border-white/10 bg-black/40 p-4 min-h-[150px]">
               <pre 
                 className="font-mono text-[10px] text-gray-400 whitespace-pre-wrap leading-relaxed"
               >
                 {lyrics}
               </pre>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  );
};
