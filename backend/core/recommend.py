import numpy as np
from typing import Dict, List, Tuple

from .utils import (
    get_single_embedding,
    query_neighbors,
    fetch_embeddings_map,
    dot_product
)

def recommend_similar_tracks(
    audio_collection,
    text_collection,
    query_id: str,
    candidate_n: int = 50,
    top_k: int = 3,
    audio_weight: float = 0.5,
    history: List[str] = None
) -> List[Dict[str, float]]:
    """
    Finds the most similar songs using an "Early Fusion" algorithm.
    Mathematically combines audio and lyric coordinates into a single hybrid 
    coordinate, then finds the closest songs to that hybrid coordinate.
    
    If 'history' is provided, skips any candidate IDs that exist in the history 
    array to prevent "Ping-Pong" loops during autoplay.
    
    Returns a list of dictionaries with keys:
    'id', 'sim_combined', 'sim_audio', 'sim_text'
    """
    if not query_id:
        raise ValueError("query_id must be provided")

    if history is None:
        history = []
        
    history_set = set(history)

    query_audio = get_single_embedding(audio_collection, query_id)
    query_text = get_single_embedding(text_collection, query_id)

    if query_audio is None and query_text is None:
        raise ValueError(f"query_id {query_id} not found in either collection")

    if query_audio is not None and query_text is not None:
        w_audio_global = float(audio_weight)
        w_text_global = 1.0 - w_audio_global
    elif query_audio is not None:
        w_audio_global, w_text_global = 1.0, 0.0
    else:
        w_audio_global, w_text_global = 0.0, 1.0

    neighbor_audio_ids = query_neighbors(audio_collection, query_audio, candidate_n)
    neighbor_text_ids = query_neighbors(text_collection, query_text, candidate_n)

    combined_candidate_ids = list(
        dict.fromkeys(list(neighbor_audio_ids) + list(neighbor_text_ids))
    )

    audio_embeddings_map = fetch_embeddings_map(audio_collection, combined_candidate_ids)
    text_embeddings_map = fetch_embeddings_map(text_collection, combined_candidate_ids)

    query_audio_arr = query_audio
    query_text_arr = query_text

    scored = []
    for cid in combined_candidate_ids:
        # Prevent Ping-Pong Effect: Skip if it is the query or already in history
        if cid == query_id or cid in history_set:
            continue

        has_audio = (query_audio_arr is not None) and (cid in audio_embeddings_map)
        has_text = (query_text_arr is not None) and (cid in text_embeddings_map)

        if not (has_audio or has_text):
            continue

        if has_audio and has_text:
            w_audio_local, w_text_local = w_audio_global, w_text_global
        elif has_audio:
            w_audio_local, w_text_local = 1.0, 0.0
        else:
            w_audio_local, w_text_local = 0.0, 1.0

        sim_audio = dot_product(query_audio_arr, audio_embeddings_map[cid]) if has_audio else 0.0
        sim_text = dot_product(query_text_arr, text_embeddings_map[cid]) if has_text else 0.0

        combined_score = w_audio_local * sim_audio + w_text_local * sim_text
        scored.append({
            "id": cid,
            "sim_combined": combined_score,
            "sim_audio": sim_audio,
            "sim_text": sim_text,
        })

    scored.sort(key=lambda x: x["sim_combined"], reverse=True)
    return scored[: max(0, top_k)]
