import pytest
from backend.ingestion.lastfm import get_lastfm_top_tracks

def test_get_lastfm_top_tracks():
    # Test a small pull to ensure pagination and parsing works
    tracks = get_lastfm_top_tracks(total_limit=150, per_page=100)
    
    assert len(tracks) == 150
    assert "title" in tracks[0]
    assert "artist" in tracks[0]
    
    # Check deduplication
    keys = [f"{t['artist'].lower()} - {t['title'].lower()}" for t in tracks]
    assert len(keys) == len(set(keys))
