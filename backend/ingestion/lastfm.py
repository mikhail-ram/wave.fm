import os
import requests
import time
import random
from typing import List, Dict
from dotenv import load_dotenv

load_dotenv()

LAST_FM_API_KEY = os.getenv("LAST_FM_API_KEY")

def get_lastfm_top_tracks(total_limit: int = 5000, per_page: int = 1000) -> List[Dict]:
    """
    Paginates the Last.FM chart.gettoptracks API to fetch up to total_limit tracks.
    Returns a deduplicated list of {"title": str, "artist": str}.
    """
    if not LAST_FM_API_KEY:
        raise ValueError("LAST_FM_API_KEY is not set in environment variables.")

    url = "http://ws.audioscrobbler.com/2.0/"
    
    unique_tracks = {} # Keyed by "artist - title" (lowercased) to deduplicate
    page = 1
    
    while len(unique_tracks) < total_limit:
        params = {
            "method": "chart.gettoptracks",
            "api_key": LAST_FM_API_KEY,
            "format": "json",
            "limit": per_page,
            "page": page
        }
        
        try:
            resp = requests.get(url, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            
            tracks = data.get("tracks", {}).get("track", [])
            if not tracks:
                break # No more tracks available from Last.FM
                
            for track in tracks:
                title = track.get("name")
                artist = track.get("artist", {}).get("name")
                
                if title and artist:
                    key = f"{artist.lower().strip()} - {title.lower().strip()}"
                    if key not in unique_tracks:
                        unique_tracks[key] = {
                            "title": title,
                            "artist": artist
                        }
                        
                if len(unique_tracks) >= total_limit:
                    break
                    
            page += 1
            time.sleep(0.5 + random.random() * 0.5) # Polite delay between pages
            
        except requests.RequestException as e:
            print(f"Error fetching Last.FM page {page}: {e}")
            break
            
    return list(unique_tracks.values())
