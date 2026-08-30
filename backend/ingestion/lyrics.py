import os
import re
import time
import random
import requests
from typing import Optional
from dotenv import load_dotenv

# Load environment variables (e.g., GENIUS_ACCESS_TOKEN)
load_dotenv()

# Initialize Genius client if token is available
GENIUS_TOKEN = os.getenv("GENIUS_ACCESS_TOKEN")
genius_client = None
if GENIUS_TOKEN:
    import lyricsgenius
    # retries=3 with exponential backoff on 429
    # sleep_time=2 guarantees a 2 second delay between requests to avoid bans
    # timeout=15 gives the scraper enough time to fetch the HTML
    genius_client = lyricsgenius.Genius(
        GENIUS_TOKEN, 
        retries=3, 
        timeout=15, 
        sleep_time=2.0, 
        verbose=False
    )

def normalize_whitespace(text: str) -> str:
    """Replace multiple spaces or tabs with a single space, and strip lines."""
    text = re.sub(r'[ \t]+', ' ', text)
    return '\n'.join(line.strip() for line in text.splitlines())

def collapse_newlines(text: str) -> str:
    """Replace 2+ newlines with a single newline."""
    return re.sub(r'\n{2,}', '\n', text)

def clean_lyrics(text: str) -> str:
    """Clean and normalize lyrics text."""
    if not text:
        return ""
    text = normalize_whitespace(text)
    text = collapse_newlines(text)
    # Remove things like "18 ContributorsLyrics..." that Genius sometimes prepends
    text = re.sub(r'^\d+\s*Contributors.*?Lyrics\s*', '', text, flags=re.IGNORECASE)
    # Remove trailing "Embed" strings from Genius
    text = re.sub(r'\d*Embed$', '', text, flags=re.IGNORECASE)
    return text.strip()

def get_lrclib_lyrics(title: str, artist: str) -> Optional[str]:
    """
    Search LRCLIB /api/search for the given title and artist.
    Returns plain text lyrics or None.
    """
    url = "https://lrclib.net/api/search"
    params = {
        "track_name": title,
        "artist_name": artist,
    }
    headers = {
        "User-Agent": "lrclib-client/0.1 (wave.fm)"
    }

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        time.sleep(0.1 + random.random() * 0.1) # Polite delay
        
        if resp.status_code != 200:
            return None
            
        results = resp.json()
        if not isinstance(results, list) or len(results) == 0:
            return None

        # Try to find a direct match
        best = results[0]
        lyrics = best.get("plainLyrics")
        
        if lyrics:
            return clean_lyrics(lyrics)

        # Fallback to stripping timestamps from syncedLyrics
        lyrics = best.get("syncedLyrics")
        if lyrics:
            lyrics = re.sub(r"\[\d{2}:\d{2}(?:\.\d{1,3})?\]\s*", "", lyrics).strip()
            if lyrics:
                return clean_lyrics(lyrics)
                
    except Exception:
        pass
        
    return None

def get_genius_lyrics(title: str, artist: str) -> Optional[str]:
    """
    Search Genius for the given title and artist using the lyricsgenius wrapper.
    Returns plain text lyrics or None.
    """
    if not genius_client:
        return None
        
    try:
        song = genius_client.search_song(title, artist)
        if song and song.lyrics:
            return clean_lyrics(song.lyrics)
    except Exception as e:
        print(f"[Warning] Genius API failed for '{title}': {e}")
        pass
        
    return None

def get_lyrics(title: str, artist: str) -> Optional[str]:
    """
    Robust fallback cascade to fetch lyrics.
    Attempt 1: LRCLib (Fast, Free)
    Attempt 2: Genius (Requires Token)
    Returns None if all fail.
    """
    # 1. Try LRCLib
    lyrics = get_lrclib_lyrics(title, artist)
    if lyrics:
        return lyrics
        
    # 2. Try Genius
    lyrics = get_genius_lyrics(title, artist)
    if lyrics:
        return lyrics
        
    # 3. Graceful degradation (handled downstream)
    return None
