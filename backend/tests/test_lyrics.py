import pytest
from backend.ingestion.lyrics import (
    clean_lyrics,
    get_lrclib_lyrics,
    get_genius_lyrics,
    get_lyrics
)

def test_clean_lyrics_genius_artifacts():
    dirty_text = "18 ContributorsTranslationsTürkçePortuguêsEspañolItalianoDeutschSloveneSlovenskiPolskiMagyarRussianРусскийRomanianRomânăBohemian Beatbox Lyrics\n[Verse 1]\nHere comes the sun\n\n42 Embed"
    cleaned = clean_lyrics(dirty_text)
    assert "18 Contributors" not in cleaned
    assert "Lyrics" not in cleaned
    assert "42 Embed" not in cleaned
    assert "[Verse 1]" in cleaned
    assert "Here comes the sun" in cleaned

def test_get_lrclib_lyrics_success():
    # A very popular song that LRCLib definitely has
    lyrics = get_lrclib_lyrics("Here Comes The Sun", "The Beatles")
    assert lyrics is not None
    assert "here comes the sun" in lyrics.lower()

def test_get_genius_lyrics_success():
    # A song to test Genius
    lyrics = get_genius_lyrics("Bohemian Rhapsody", "Queen")
    if lyrics:  # It might be None if no API key is provided during CI, but locally it should work
        assert "Is this the real life" in lyrics
        assert "Embed" not in lyrics[-10:] # check our cleaner works at the end

def test_get_lyrics_fallback():
    # This should hit LRCLib and return quickly
    lyrics1 = get_lyrics("Shape of You", "Ed Sheeran")
    assert lyrics1 is not None
    assert "club" in lyrics1.lower()
    
    # Try an obscure song that LRCLib probably doesn't have but Genius might
    lyrics2 = get_lyrics("ThisIsAFakeSongThatDoesNotExist12345", "FakeArtist999")
    assert lyrics2 is None
