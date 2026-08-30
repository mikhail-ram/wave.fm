import random
from typing import Dict, List, Optional
import numpy as np
from chromadb.api import Collection

def get_single_embedding(collection: Collection, doc_id: str) -> Optional[np.ndarray]:
    """Retrieves the embedding for a single document ID from ChromaDB.

    Args:
        collection (Collection): The ChromaDB collection to search.
        doc_id (str): The unique ID of the document to retrieve.

    Returns:
        Optional[np.ndarray]: The mathematical coordinates of the document as a 
            numpy array (float), or None if the document is not found.
    """
    resp = collection.get(ids=[doc_id], include=["embeddings"])
    embeddings = resp.get("embeddings", [])
    if embeddings and len(embeddings) > 0:
        return np.asarray(embeddings[0], dtype=float)
    return None

def query_neighbors(collection: Collection, query_embedding: np.ndarray, n: int) -> List[str]:
    """Finds the most similar documents to a given embedding.

    Args:
        collection (Collection): The ChromaDB collection to query.
        query_embedding (np.ndarray): The base embedding to compare against.
        n (int): The number of nearest neighbors to return.

    Returns:
        List[str]: A list of document IDs ordered by similarity (closest first).
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

def fetch_embeddings_map(collection: Collection, ids: List[str]) -> Dict[str, np.ndarray]:
    """Downloads embeddings for multiple IDs simultaneously.

    Args:
        collection (Collection): The ChromaDB collection to query.
        ids (List[str]): A list of document IDs to retrieve embeddings for.

    Returns:
        Dict[str, np.ndarray]: A dictionary mapping document IDs to their numpy embeddings 
            for quick O(1) lookups.
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
    """Calculates the dot product between two embeddings.
    
    If the embeddings are L2 normalized, this is mathematically equivalent 
    to Cosine Similarity.

    Args:
        a (np.ndarray): The first embedding vector.
        b (np.ndarray): The second embedding vector.

    Returns:
        float: The scalar dot product.
    """
    return float(np.dot(a, b))

def get_nth_id(collection: Collection, n: Optional[int] = None) -> str:
    """Retrieves a specific document ID by its numerical index, or a random one.

    Args:
        collection (Collection): The ChromaDB collection to retrieve from.
        n (Optional[int]): The positional index of the document. If None, 
            a random index is chosen.

    Raises:
        IndexError: If the collection is empty or the index is out of bounds.
        TypeError: If n is provided but is not an integer.

    Returns:
        str: The ID of the document at position n.
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
