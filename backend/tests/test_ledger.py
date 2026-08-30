import os
import tempfile
from backend.ingestion.ledger import load_ledger, update_ledger

def test_ledger_operations():
    # Use a temporary file for the ledger
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        ledger_path = tmp.name
        
    try:
        # 1. Load empty ledger
        ledger = load_ledger(ledger_path)
        assert ledger == {}
        
        # 2. Update ledger
        update_ledger(ledger_path, "yt:123", {"audio_status": "done"})
        ledger = load_ledger(ledger_path)
        assert ledger["yt:123"]["audio_status"] == "done"
        
        # 3. Update existing entry
        update_ledger(ledger_path, "yt:123", {"lyrics_status": "failed"})
        ledger = load_ledger(ledger_path)
        assert ledger["yt:123"]["audio_status"] == "done"
        assert ledger["yt:123"]["lyrics_status"] == "failed"
        
        # 4. Add new entry
        update_ledger(ledger_path, "yt:456", {"audio_status": "pending"})
        ledger = load_ledger(ledger_path)
        assert "yt:123" in ledger
        assert ledger["yt:456"]["audio_status"] == "pending"
        
    finally:
        os.remove(ledger_path)
