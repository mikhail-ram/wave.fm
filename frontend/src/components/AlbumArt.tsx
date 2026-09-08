import React, { useState, useEffect } from 'react';

interface AlbumArtProps {
  title: string;
  artist: string;
  videoId?: string;
  className?: string;
}

export const AlbumArt: React.FC<AlbumArtProps> = ({ title, artist, videoId, className = '' }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    
    // First try iTunes API for high-res square album art
    const query = encodeURIComponent(`${title} ${artist}`);
    fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        if (data.results && data.results.length > 0 && data.results[0].artworkUrl100) {
          // Replace 100x100 with 600x600 for high resolution
          const highRes = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
          setImageUrl(highRes);
        } else if (videoId) {
          // Fallback to YouTube maxresdefault (16:9, but we can center crop)
          setImageUrl(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
        } else {
          setImageUrl(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        // Fallback on error
        if (videoId) {
          setImageUrl(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
        } else {
          setImageUrl(null);
        }
        setLoading(false);
      });

    return () => { active = false; };
  }, [title, artist, videoId]);

  if (loading) {
    return <div className={`flex items-center justify-center bg-gray-900 border border-white/20 animate-pulse ${className}`}>
      <span className="text-gray-600 font-mono text-xs text-center p-4">CONNECTING_</span>
    </div>;
  }

  if (!imageUrl) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 border border-white/20 ${className}`}>
        <span className="text-gray-600 font-mono text-xs text-center p-4">NO VISUAL DATA</span>
      </div>
    );
  }

  return (
    <img 
      src={imageUrl} 
      alt="Album Art" 
      className={`object-cover ${className}`}
      onError={(e) => {
        // If maxresdefault fails (some videos don't have it), fallback to hqdefault
        if (imageUrl.includes('maxresdefault')) {
          setImageUrl(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
        }
      }}
    />
  );
};
