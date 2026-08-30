import json
import re
from pathlib import Path
from tqdm import tqdm
import torch

from backend.core.db import get_text_collection
from backend.scripts.ingest import load_models, process_lyrics

def run_patch():
    BASE_DIR = Path(__file__).resolve().parent.parent
    LEDGER_PATH = BASE_DIR / "db" / "ingestion_ledger.json"
    
    if not LEDGER_PATH.exists():
        print("No ledger found.")
        return
        
    with open(LEDGER_PATH, "r") as f:
        ledger = json.load(f)
        
    print("Loading models for patching...")
    mulan, tokenizer, device = load_models()
    text_col = get_text_collection()
    
    to_patch = []
    for track_key, status in ledger.items():
        if status.get("overall_status") == "done" and status.get("lyrics_text"):
            raw_lyrics = status["lyrics_text"]
            # Check if it has timestamps
            if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', raw_lyrics):
                to_patch.append((track_key, status))
                
    if not to_patch:
        print("No songs need patching!")
        return
        
    print(f"Found {len(to_patch)} songs that need their text embeddings cleaned.")
    
    for track_key, status in tqdm(to_patch, desc="Patching lyrics"):
        raw_lyrics = status["lyrics_text"]
        song_id = status["song_id"]
        
        # Strip timestamps
        clean_lyrics = re.sub(r'\[\d{2}:\d{2}\.\d{2,3}\]\s*', '', raw_lyrics)
        
        # Re-embed
        with torch.no_grad():
            new_emb = process_lyrics(clean_lyrics, mulan, tokenizer, device)
            
        # Update ChromaDB text collection
        # We use update() to overwrite the existing embedding for this song_id
        text_col.update(
            ids=[song_id],
            embeddings=[new_emb.tolist()]
        )
        
    print("Successfully patched all dirty embeddings! You kept all your audio processing.")

if __name__ == "__main__":
    run_patch()
