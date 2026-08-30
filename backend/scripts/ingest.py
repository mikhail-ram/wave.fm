import os
import time
import datetime
import math
import argparse
from pathlib import Path
from typing import List, Dict

import torch
import numpy as np
import librosa
from tqdm import tqdm
from yt_dlp import YoutubeDL
from transformers import XLMRobertaTokenizer
from muq import MuQMuLan

from backend.ingestion.ledger import load_ledger, update_ledger
from backend.ingestion.lastfm import get_lastfm_top_tracks
from backend.ingestion.lyrics import get_lyrics

# Use absolute paths for stability
BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "db"
TMP_DIR = BASE_DIR / "tmp_audio"
LEDGER_PATH = DB_DIR / "ingestion_ledger.json"

SR = 24000
CHUNK_SECONDS = 30
SAMPLES_PER_CHUNK = SR * CHUNK_SECONDS
MAX_TOKENS = 512

def l2_normalize(vec: np.ndarray, eps: float = 1e-12) -> np.ndarray:
    norm = np.linalg.norm(vec)
    if norm < eps:
        return vec
    return vec / norm

def mean_pool_embeddings(embs_list: List[np.ndarray]) -> np.ndarray:
    if not embs_list:
        return np.zeros((512,), dtype=np.float32)
    stacked = np.stack(embs_list, axis=0)
    return l2_normalize(np.mean(stacked, axis=0))

def load_models():
    """Load MuQ-MuLan and tokenizer once."""
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"Loading MuQ-MuLan on {device}...")
    mulan = MuQMuLan.from_pretrained("OpenMuQ/MuQ-MuLan-large").to(device).eval()
    tokenizer = XLMRobertaTokenizer.from_pretrained("xlm-roberta-base")
    return mulan, tokenizer, device

def download_audio(query: str, out_dir: Path) -> Path:
    """Downloads audio via yt-dlp and transcodes to 24k float32 mono WAV."""
    out_dir.mkdir(parents=True, exist_ok=True)
    out_template = str(out_dir / "%(id)s.%(ext)s")
    
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "quiet": True,
        "noplaylist": True,
        "extractor_args": {"youtube": {"player_client": ["android"]}},
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
        }],
        # ffmpeg postprocessor args to ensure 24kHz mono float32
        "postprocessor_args": [
            "-ar", str(SR),
            "-ac", "1",
            "-c:a", "pcm_f32le"
        ],
    }
    
    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"ytsearch1:{query}", download=True)
        entries = info.get("entries", [info])
        if not entries:
            raise ValueError("No YouTube results found.")
        video_id = entries[0]["id"]
        
    wav_path = out_dir / f"{video_id}.wav"
    if not wav_path.exists():
        raise RuntimeError("WAV file not produced by yt-dlp/ffmpeg.")
    return wav_path, f"yt:{video_id}"

def process_audio(wav_path: Path, mulan, device, title: str, artist: str) -> np.ndarray:
    """Chunks audio and computes mean-pooled embedding."""
    wav, _ = librosa.load(wav_path, sr=SR, mono=True)
    T = wav.shape[0]
    chunks_count = math.ceil(T / SAMPLES_PER_CHUNK)
    
    chunks = []
    for i in range(chunks_count):
        start = i * SAMPLES_PER_CHUNK
        end = min(start + SAMPLES_PER_CHUNK, T)
        chunk = wav[start:end]
        if chunk.shape[0] < SAMPLES_PER_CHUNK:
            chunk = np.pad(chunk, (0, SAMPLES_PER_CHUNK - chunk.shape[0]), mode="constant")
        chunks.append(chunk.astype(np.float32))
        
    if not chunks:
        raise ValueError("Audio file too short to chunk.")
        
    # Batch infer
    batch = np.stack(chunks, axis=0)
    batch_t = torch.from_numpy(batch).to(device=device, dtype=torch.float32)
    
    with torch.no_grad():
        emb_t = mulan(wavs=batch_t)
        
    embs_np = emb_t.cpu().numpy()
    return mean_pool_embeddings([embs_np[i] for i in range(embs_np.shape[0])])

def process_lyrics(text: str, mulan, tokenizer, device) -> np.ndarray:
    """Computes text embedding using MuLan's text tower."""
    encoded = tokenizer(
        text,
        padding='max_length',
        truncation=True,
        max_length=MAX_TOKENS,
        return_tensors='pt'
    )
    input_ids = encoded['input_ids'].to(device)
    attention_mask = encoded['attention_mask'].to(device)
    
    with torch.no_grad():
        text_embeds = mulan.mulan.text.pred_pretrained_model_hidden(
            input_ids=input_ids, 
            attention_mask=attention_mask
        )
        text_embeds = mulan.mulan.text.proj(text_embeds)
        text_embeds, _ = mulan.mulan.text.transformer(text_embeds, return_all_layers=True)
        text_embeds = text_embeds.mean(dim=-2)
        
        latents = mulan.mulan.text_to_latents(text_embeds)
        emb_output = mulan.mulan._norm_latents(latents)
        
    return l2_normalize(emb_output[0].cpu().numpy())

def run_ingestion(total_limit: int):
    print("1. Fetching global tracks...")
    tracks = get_lastfm_top_tracks(total_limit=total_limit)
    print(f"Found {len(tracks)} tracks.")
    
    ledger = load_ledger(str(LEDGER_PATH))
    
    mulan, tokenizer, device = load_models()
    
    # Load ChromaDB clients
    from backend.core.db import get_audio_collection, get_text_collection
    audio_col = get_audio_collection()
    text_col = get_text_collection()
    
    for track in tqdm(tracks, desc="Processing tracks"):
        title, artist = track["title"], track["artist"]
        track_key = f"{artist.lower().strip()} - {title.lower().strip()}"
        
        status = ledger.get(track_key, {})
        if status.get("overall_status") == "done":
            continue # Skip completed
            
        print(f"\nProcessing: {title} by {artist}")
        
        # 1. LYRICS
        lyrics_text = status.get("lyrics_text")
        lyrics_emb = None
        if status.get("lyrics_status") != "done":
            raw_lyrics = get_lyrics(title, artist)
            if raw_lyrics:
                import re
                # Strip [00:00.00] style LRC timestamps before embedding
                clean_lyrics = re.sub(r'\[\d{2}:\d{2}\.\d{2,3}\]\s*', '', raw_lyrics)
                
                lyrics_emb = process_lyrics(clean_lyrics, mulan, tokenizer, device)
                update_ledger(str(LEDGER_PATH), track_key, {
                    "lyrics_status": "done",
                    "lyrics_text": raw_lyrics, # Keep raw timestamps in ledger for future karaoke features!
                })
            else:
                update_ledger(str(LEDGER_PATH), track_key, {
                    "lyrics_status": "failed_or_missing",
                })
        
        # 2. AUDIO
        audio_emb = None
        song_id = status.get("song_id")
        if status.get("audio_status") != "done":
            try:
                wav_path, song_id = download_audio(f"{title} {artist}", TMP_DIR)
                audio_emb = process_audio(wav_path, mulan, device, title, artist)
                
                # Cleanup tmp audio
                if wav_path.exists():
                    os.remove(wav_path)
                    
                update_ledger(str(LEDGER_PATH), track_key, {
                    "audio_status": "done",
                    "song_id": song_id
                })
            except Exception as e:
                print(f"[ERROR] Audio processing failed for {track_key}: {e}")
                update_ledger(str(LEDGER_PATH), track_key, {
                    "audio_status": "failed",
                    "error": str(e)
                })
                continue # Skip upsert if audio fails
                
        # 3. UPSERT TO CHROMA
        if status.get("audio_status") == "done" or audio_emb is not None:
            # We need to upsert both modalities if available
            try:
                metadata = {
                    "title": title,
                    "artist": artist,
                    "processed_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                }
                
                if audio_emb is not None:
                    audio_col.upsert(
                        ids=[song_id],
                        embeddings=[audio_emb.tolist()],
                        metadatas=[metadata]
                    )
                    
                if lyrics_emb is not None:
                    text_col.upsert(
                        ids=[song_id],
                        embeddings=[lyrics_emb.tolist()],
                        metadatas=[metadata]
                    )
                    
                update_ledger(str(LEDGER_PATH), track_key, {
                    "overall_status": "done"
                })
                print(f"Successfully upserted {song_id} to ChromaDB.")
            except Exception as e:
                print(f"[ERROR] ChromaDB upsert failed for {track_key}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=10, help="Number of tracks to process")
    args = parser.parse_args()
    
    run_ingestion(args.limit)
