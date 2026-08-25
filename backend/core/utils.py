import random
from typing import Dict, List, Optional
import numpy as np

def get_single_embedding(collection, doc_id: str) -> Optional[np.ndarray]:
    """
    Looks up a single document in the database and returns its mathematical 
    coordinates (embedding) as a numpy array.
    """
    resp = collection.get(ids=[doc_id], include=["embeddings"])
    embeddings = resp.get("embeddings", [])
    if embeddings and len(embeddings) > 0:
        return np.asarray(embeddings[0], dtype=float)
    return None

def query_neighbors(collection, query_embedding: np.ndarray, n: int) -> List[str]:
    """
    Finds the IDs of the most similar documents in the database 
    using nearest-neighbor search.
    """
    if query_embedding is None:
        return []
    resp = collection.query(
        query_embeddings=[query_embedding.tolist()], 
        n_results=n, 
        include=[]
    )
    ids_list = resp.get("ids", [[]])
    return ids_list[0] if ids_list else []

def fetch_embeddings_map(collection, ids: List[str]) -> Dict[str, np.ndarray]:
    """
    Downloads mathematical coordinates for multiple IDs at once, 
    returning a dictionary for quick O(1) lookups.
    """
    if not ids:
        return {}
    resp = collection.get(ids=ids, include=["embeddings"])
    ids_fetched = resp.get("ids", [])
    embeddings_fetched = resp.get("embeddings", [])
    return {
        i: np.asarray(e, dtype=float) 
        for i, e in zip(ids_fetched, embeddings_fetched)
    }

def dot_product(a: np.ndarray, b: np.ndarray) -> float:
    """
    Calculates the cosine similarity (assuming normalized vectors) 
    between two embeddings via dot product.
    """
    return float(np.dot(a, b))

def get_nth_id(collection, n: Optional[int] = None) -> str:
    """
    Grabs a specific track from the database by its numerical position, 
    or picks a random track if no number is given.
    """
    total = collection.count()
    if total == 0:
        raise IndexError("Collection is empty")

    resp = collection.get(include=[], limit=total)
    ids = resp.get("ids", [])

    if ids and isinstance(ids[0], list):
        ids = ids[0]

    if n is None:
        n = random.randrange(0, len(ids))
    elif not isinstance(n, int):
        raise TypeError("n must be an int or None")
    elif n < 0 or n >= len(ids):
        raise IndexError(f"Index out of range (0..{len(ids) - 1}): got {n}")

    return ids[n]
