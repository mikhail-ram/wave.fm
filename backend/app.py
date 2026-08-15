import random
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import chromadb
import numpy as np

base_dir = Path(__file__).resolve().parent
persist_dir = base_dir / "db"
persist_dir.mkdir(parents=True, exist_ok=True)
PERSIST_DIR = str(persist_dir)

client = chromadb.PersistentClient(path=PERSIST_DIR)

audio_collection = client.get_collection(name="tracks")
text_collection = client.get_collection(name="text_embeddings")


def _get_single_embedding(collection, doc_id: str) -> Optional[List[float]]:
    """Return the stored embedding for doc_id from collection or None if not present."""
    resp = collection.get(ids=[doc_id], include=["embeddings"])
    embeddings = resp.get("embeddings", [])
    if len(embeddings) > 0:
        return np.asarray(embeddings[0], dtype=float)
    return None


def _query_neighbors(collection, query_embedding, n: int) -> List[str]:
    """Return list of neighbor ids from collection for the given query embedding.
    If query_embedding is None, return empty list."""
    if query_embedding is None:
        return []
    resp = collection.query(query_embeddings=[query_embedding], n_results=n, include=[])
    ids_list = resp.get("ids", [[]])
    return ids_list[0] if ids_list else []


def _fetch_embeddings_map(collection, ids: List[str]) -> Dict[str, np.ndarray]:
    """Fetch embeddings for a list of ids and return a dict id -> np.array(embedding)."""
    if not ids:
        return {}
    resp = collection.get(ids=ids, include=["embeddings"])
    ids_fetched = resp.get("ids", [])
    embeddings_fetched = resp.get("embeddings", [])
    return {
        i: np.asarray(e, dtype=float) for i, e in zip(ids_fetched, embeddings_fetched)
    }


def _dot_product(a: np.ndarray, b: np.ndarray) -> float:
    """Compute dot product. Inputs assumed to be numpy arrays."""
    return float(np.dot(a, b))


def recommend_similar_tracks(
    audio_collection,
    text_collection,
    query_id: str,
    candidate_n: int = 50,
    top_k: int = 3,
    audio_weight: float = 0.5,
) -> List[Tuple[str, float, float, float]]:
    """
    Return top_k candidates as (id, combined_score, sim_audio, sim_text), sorted by combined_score desc.

    - audio_collection, text_collection: chromadb collections
    - query_id: required id present in at least one collection
    - candidate_n: neighbors requested per modality
    - top_k: number of returned results
    - audio_weight: alpha - weight for audio when both modalities are present (0..1)
    """
    if not query_id:
        raise ValueError("query_id must be provided")

    # 1) fetch query embeddings (may be None if not present in that collection)
    query_audio = _get_single_embedding(audio_collection, query_id)
    query_text = _get_single_embedding(text_collection, query_id)

    if query_audio is None and query_text is None:
        raise ValueError(f"query_id {query_id} not found in either collection")

    # 2) effective global weights when both modalities exist for query
    if query_audio is not None and query_text is not None:
        w_audio_global = float(audio_weight)
        w_text_global = 1.0 - w_audio_global
    elif query_audio is not None:
        w_audio_global, w_text_global = 1.0, 0.0
    else:
        w_audio_global, w_text_global = 0.0, 1.0

    # 3) query each collection for neighbors (empty list if that modality not available)
    neighbor_audio_ids = _query_neighbors(audio_collection, query_audio, candidate_n)
    neighbor_text_ids = _query_neighbors(text_collection, query_text, candidate_n)

    # preserve order and uniqueness: audio neighbors first then text neighbors
    combined_candidate_ids = list(
        dict.fromkeys(list(neighbor_audio_ids) + list(neighbor_text_ids))
    )

    # 4) fetch embeddings for candidates from both collections
    audio_embeddings_map = _fetch_embeddings_map(
        audio_collection, combined_candidate_ids
    )
    text_embeddings_map = _fetch_embeddings_map(text_collection, combined_candidate_ids)

    # 5) prepare query arrays (we keep them as stored; no normalization done here)
    query_audio_arr = (
        np.asarray(query_audio, dtype=float) if query_audio is not None else None
    )
    query_text_arr = (
        np.asarray(query_text, dtype=float) if query_text is not None else None
    )

    # 6) score candidates with per-candidate renormalization
    scored = []
    for cid in combined_candidate_ids:
        if cid == query_id:
            continue

        has_audio = (query_audio_arr is not None) and (cid in audio_embeddings_map)
        has_text = (query_text_arr is not None) and (cid in text_embeddings_map)

        # skip candidate if it has neither embedding
        if not (has_audio or has_text):
            continue

        # per-candidate weight renormalization:
        if has_audio and has_text:
            w_audio_local, w_text_local = w_audio_global, w_text_global
        elif has_audio:
            w_audio_local, w_text_local = 1.0, 0.0
        else:  # has_text only
            w_audio_local, w_text_local = 0.0, 1.0

        sim_audio = (
            _dot_product(query_audio_arr, audio_embeddings_map[cid])
            if has_audio
            else 0.0
        )
        sim_text = (
            _dot_product(query_text_arr, text_embeddings_map[cid]) if has_text else 0.0
        )

        combined_score = w_audio_local * sim_audio + w_text_local * sim_text
        scored.append(
            {
                "id": cid,
                "sim_combined": combined_score,
                "sim_audio": sim_audio,
                "sim_text": sim_text,
            }
        )

    # 7) sort and return top_k
    scored.sort(key=lambda x: x["sim_combined"], reverse=True)
    return scored[: max(0, top_k)]


def _get_nth_id(collection, n: Optional[int] = None) -> str:
    """
    Return the id at zero-based index n from the given collection.
    If n is None, pick a random index from 0..(count-1).

    Raises IndexError if the collection is empty or if n is out of range.
    """
    total = collection.count()
    if total == 0:
        raise IndexError("collection is empty")

    # fetch all ids (respecting chroma's possible nested-list shape)
    resp = collection.get(include=[], limit=total)
    ids = resp.get("ids", [])

    # flatten one level if needed: [["id1", "id2"]] -> ["id1", "id2"]
    if ids and isinstance(ids[0], list):
        ids = ids[0]

    if n is None:
        n = random.randrange(0, len(ids))  # zero-based random index
    else:
        # ensure n is an int and within bounds
        if not isinstance(n, int):
            raise TypeError("n must be an int or None")
        if n < 0 or n >= len(ids):
            raise IndexError(f"index out of range (0..{len(ids) - 1}): got {n}")

    return ids[n]


def interpolate_tracks(
    audio_collection,
    text_collection,
    source_id: str,
    dest_id: str,
    n_steps: int,
    audio_weight: float = 0.5,
) -> List[Dict]:
    source_audio = _get_single_embedding(audio_collection, source_id)
    source_text = _get_single_embedding(text_collection, source_id)
    dest_audio = _get_single_embedding(audio_collection, dest_id)
    dest_text = _get_single_embedding(text_collection, dest_id)
    
    if source_audio is None or dest_audio is None or source_text is None or dest_text is None:
        raise ValueError("Missing embeddings for source or dest")
        
    results = []
    fractions = [i / (n_steps + 1) for i in range(1, n_steps + 1)]
    
    w_audio_global = float(audio_weight)
    w_text_global = 1.0 - w_audio_global
    
    for alpha in fractions:
        interp_audio = source_audio + alpha * (dest_audio - source_audio)
        interp_text = source_text + alpha * (dest_text - source_text)
        
        norm_audio = np.linalg.norm(interp_audio)
        if norm_audio > 0: interp_audio /= norm_audio
        
        norm_text = np.linalg.norm(interp_text)
        if norm_text > 0: interp_text /= norm_text
        
        candidate_n = 50
        neighbor_audio_ids = _query_neighbors(audio_collection, interp_audio.tolist(), candidate_n)
        neighbor_text_ids = _query_neighbors(text_collection, interp_text.tolist(), candidate_n)
        
        combined_candidate_ids = list(dict.fromkeys(list(neighbor_audio_ids) + list(neighbor_text_ids)))
        
        if source_id in combined_candidate_ids: combined_candidate_ids.remove(source_id)
        if dest_id in combined_candidate_ids: combined_candidate_ids.remove(dest_id)
        existing_ids = [r["id"] for r in results]
        combined_candidate_ids = [c for c in combined_candidate_ids if c not in existing_ids]
        
        audio_embeddings_map = _fetch_embeddings_map(audio_collection, combined_candidate_ids)
        text_embeddings_map = _fetch_embeddings_map(text_collection, combined_candidate_ids)
        
        best_candidate = None
        best_score = -float('inf')
        
        for cid in combined_candidate_ids:
            has_audio = cid in audio_embeddings_map
            has_text = cid in text_embeddings_map
            if not (has_audio or has_text): continue
            
            w_a, w_t = (w_audio_global, w_text_global) if (has_audio and has_text) else (1.0, 0.0) if has_audio else (0.0, 1.0)
                
            sim_audio = _dot_product(interp_audio, audio_embeddings_map[cid]) if has_audio else 0.0
            sim_text = _dot_product(interp_text, text_embeddings_map[cid]) if has_text else 0.0
            
            combined_score = w_a * sim_audio + w_t * sim_text
            
            if combined_score > best_score:
                best_score = combined_score
                best_candidate = {
                    "id": cid,
                    "sim_combined": combined_score,
                    "sim_audio": sim_audio,
                    "sim_text": sim_text
                }
                
        if best_candidate:
            results.append(best_candidate)
            
    return results

if __name__ == "__main__":
    query_id = _get_nth_id(audio_collection)
    print(f"Query ID: {query_id}")
    top_results = recommend_similar_tracks(
        audio_collection=audio_collection,
        text_collection=text_collection,
        query_id=query_id,
        candidate_n=50,
        top_k=5,
        audio_weight=0.5,
    )
    for item in top_results:
        print(item)  # (id, combined_score, sim_audio, sim_text)

    print(text_collection.peek())
