import chromadb
from chromadb.api import Collection
from pathlib import Path

# Base directory for the backend
BASE_DIR = Path(__file__).resolve().parent.parent

# Path to the ChromaDB storage
PERSIST_DIR = BASE_DIR / "db"
PERSIST_DIR.mkdir(parents=True, exist_ok=True)

# Initialize the ChromaDB client
client = chromadb.PersistentClient(path=str(PERSIST_DIR))

# Get the collections
audio_collection = client.get_collection(name="tracks")
text_collection = client.get_collection(name="text_embeddings")

def get_audio_collection() -> Collection:
    """Retrieves the ChromaDB collection containing audio embeddings and metadata.
    
    Returns:
        Collection: The ChromaDB collection object for tracks.
    """
    return audio_collection

def get_text_collection() -> Collection:
    """Retrieves the ChromaDB collection containing text (lyrics) embeddings.
    
    Returns:
        Collection: The ChromaDB collection object for text_embeddings.
    """
    return text_collection
