import json
import os
import fcntl
from typing import Dict, Any

def load_ledger(path: str) -> Dict[str, Any]:
    """
    Loads the ledger from a JSON file.
    Returns an empty dict if the file doesn't exist or is corrupted.
    """
    if not os.path.exists(path):
        return {}
        
    try:
        with open(path, "r", encoding="utf-8") as f:
            # We use fcntl to acquire a shared lock for reading (if we wanted to be extremely safe),
            # but standard read is usually fine for a single-threaded batch process.
            return json.load(f)
    except json.JSONDecodeError:
        print(f"Warning: Ledger at {path} is corrupted. Starting fresh.")
        return {}

def update_ledger(path: str, song_id: str, data: Dict[str, Any]):
    """
    Atomically updates the ledger with data for a specific song_id.
    We use file locking (fcntl) to ensure multiple processes don't corrupt the JSON.
    """
    ledger = {}
    
    # Create file if it doesn't exist
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump({}, f)
            
    # Open for read/write with an exclusive lock
    with open(path, "r+", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            # Read current
            f.seek(0)
            try:
                ledger = json.load(f)
            except json.JSONDecodeError:
                ledger = {}
                
            # Update
            if song_id not in ledger:
                ledger[song_id] = {}
            ledger[song_id].update(data)
            
            # Write back
            f.seek(0)
            f.truncate()
            json.dump(ledger, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
