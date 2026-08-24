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
    """Looks up a single song in the database and returns its mathematical coordinates (embedding). Returns None if the song is not found."""
    resp = collection.get(ids=[doc_id], include=["embeddings"])
    embeddings = resp.get("embeddings", [])
    if len(embeddings) > 0:
        return np.asarray(embeddings[0], dtype=float)
    return None


def _query_neighbors(collection, query_embedding, n: int) -> List[str]:
    """Finds the most similar songs in the database by looking for the closest mathematical coordinates.
    If query_embedding is None, return empty list."""
    if query_embedding is None:
        return []
    resp = collection.query(query_embeddings=[query_embedding], n_results=n, include=[])
    ids_list = resp.get("ids", [[]])
    return ids_list[0] if ids_list else []


def _fetch_embeddings_map(collection, ids: List[str]) -> Dict[str, np.ndarray]:
    """Takes a list of song IDs and downloads all their mathematical coordinates from the database at once, returning a dictionary for quick lookups."""
    if not ids:
        return {}
    resp = collection.get(ids=ids, include=["embeddings"])
    ids_fetched = resp.get("ids", [])
    embeddings_fetched = resp.get("embeddings", [])
    return {
        i: np.asarray(e, dtype=float) for i, e in zip(ids_fetched, embeddings_fetched)
    }


def _dot_product(a: np.ndarray, b: np.ndarray) -> float:
    """Calculates the similarity between two songs by comparing their mathematical coordinates. A higher number means they are more similar."""
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
    Finds the most similar songs for the Discover Tab.
    
    This uses an "Early Fusion" algorithm. Instead of finding audio matches and lyric matches separately,
    it mathematically combines the audio and lyric coordinates into a single hybrid coordinate, and then
    finds the closest songs to that hybrid coordinate.
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
    Grabs a specific song from the database by its numerical position, or picks a random song if no number is given.
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

    """
    Finds a smooth, step-by-step musical journey between two songs for the Interpolate Tab.
    
    This uses a "Geodesic Pathfinding" algorithm (A* Search). Instead of drawing a straight mathematical
    line (which often passes through empty space where no songs exist), it treats the database like a physical 
    constellation of stars. It hops from neighbor to neighbor, finding the shortest physical path along the 
    existing cluster of songs. This guarantees a smooth transition without skipping across unrelated genres.
    """
    import heapq
    w_audio = float(audio_weight)
    w_text = 1.0 - w_audio
    
    total = audio_collection.count()
    if total == 0: return []
    
    resp = audio_collection.get(include=["embeddings"], limit=total)
    ids = resp.get("ids", [])
    audio_embeddings = resp.get("embeddings", [])
    
    text_resp = text_collection.get(ids=ids, include=["embeddings"])
    text_emb_map = {i: e for i, e in zip(text_resp.get("ids", []), text_resp.get("embeddings", []))}
    
    A_mat = np.array(audio_embeddings, dtype=float)
    T_mat = np.array([text_emb_map.get(cid, np.zeros_like(A_mat[0])) for cid in ids], dtype=float)
    
    E_C_mat = w_audio * A_mat + w_text * T_mat
    norms = np.linalg.norm(E_C_mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    E_C_mat /= norms
    sim_matrix = np.dot(E_C_mat, E_C_mat.T)
    dist_matrix = 2.0 - 2.0 * sim_matrix
    
    try:
        source_idx = ids.index(source_id)
        dest_idx = ids.index(dest_id)
    except ValueError:
        return []
        
    # Build k-NN graph EXACTLY like the UI layout (top_k=5)
    top_k = 5
    graph = {i: [] for i in range(len(ids))}
    for i in range(len(ids)):
        neighbors = np.argsort(sim_matrix[i])[-(top_k+1):]
        for n in neighbors:
            if n != i:
                graph[i].append(n)
                
    # A* Search / Dijkstra Geodesic Pathfinding
    distances = {i: float('inf') for i in range(len(ids))}
    distances[source_idx] = 0
    previous = {i: None for i in range(len(ids))}
    pq = [(0, source_idx)]
    
    while pq:
        current_dist, current_node = heapq.heappop(pq)
        
        if current_node == dest_idx:
            break
            
        if current_dist > distances[current_node]:
            continue
            
        for neighbor in graph[current_node]:
            cost = dist_matrix[current_node, neighbor]
            new_dist = current_dist + cost
            
            if new_dist < distances[neighbor]:
                distances[neighbor] = new_dist
                previous[neighbor] = current_node
                heapq.heappush(pq, (new_dist, neighbor))
                
    path_ids = []
    curr = dest_idx
    while curr is not None:
        path_ids.append(curr)
        curr = previous[curr]
    path_ids.reverse()
    
    # We remove source and dest from intermediate results
    if len(path_ids) >= 2:
        path_ids = path_ids[1:-1]
    else:
        path_ids = []
        
    # Cap to n_steps if the geodesic path happens to be longer
    if len(path_ids) > n_steps:
        # Sample or take first N
        # Taking evenly spaced steps
        indices = np.linspace(0, len(path_ids)-1, n_steps, dtype=int)
        path_ids = [path_ids[i] for i in indices]
        
    results = []
    for idx in path_ids:
        results.append({
            "id": ids[idx],
            "sim_combined": float(sim_matrix[idx, dest_idx])
        })
        
    return results

def generate_graph_data(audio_collection, text_collection, top_k: int = 5, audio_weight: float = 0.5) -> Dict:
    """
    Generates the 2D constellation map for the user interface.
    
    For every song in the database, it finds its Top 5 closest neighbors using the hybrid audio/lyric coordinates.
    It then returns these connections as "springs" so the frontend physics engine can organize them into clusters.
    """
 random
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
    """Looks up a single song in the database and returns its mathematical coordinates (embedding). Returns None if the song is not found."""
    resp = collection.get(ids=[doc_id], include=["embeddings"])
    embeddings = resp.get("embeddings", [])
    if len(embeddings) > 0:
        return np.asarray(embeddings[0], dtype=float)
    return None


def _query_neighbors(collection, query_embedding, n: int) -> List[str]:
    """Finds the most similar songs in the database by looking for the closest mathematical coordinates.
    If query_embedding is None, return empty list."""
    if query_embedding is None:
        return []
    resp = collection.query(query_embeddings=[query_embedding], n_results=n, include=[])
    ids_list = resp.get("ids", [[]])
    return ids_list[0] if ids_list else []


def _fetch_embeddings_map(collection, ids: List[str]) -> Dict[str, np.ndarray]:
    """Takes a list of song IDs and downloads all their mathematical coordinates from the database at once, returning a dictionary for quick lookups."""
    if not ids:
        return {}
    resp = collection.get(ids=ids, include=["embeddings"])
    ids_fetched = resp.get("ids", [])
    embeddings_fetched = resp.get("embeddings", [])
    return {
        i: np.asarray(e, dtype=float) for i, e in zip(ids_fetched, embeddings_fetched)
    }


def _dot_product(a: np.ndarray, b: np.ndarray) -> float:
    """Calculates the similarity between two songs by comparing their mathematical coordinates. A higher number means they are more similar."""
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
    Finds the most similar songs for the Discover Tab.
    
    This uses an "Early Fusion" algorithm. Instead of finding audio matches and lyric matches separately,
    it mathematically combines the audio and lyric coordinates into a single hybrid coordinate, and then
    finds the closest songs to that hybrid coordinate.
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
    Grabs a specific song from the database by its numerical position, or picks a random song if no number is given.
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

    """
    Finds a smooth, step-by-step musical journey between two songs for the Interpolate Tab.
    
    This uses a "Geodesic Pathfinding" algorithm (A* Search). Instead of drawing a straight mathematical
    line (which often passes through empty space where no songs exist), it treats the database like a physical 
    constellation of stars. It hops from neighbor to neighbor, finding the shortest physical path along the 
    existing cluster of songs. This guarantees a smooth transition without skipping across unrelated genres.
    """
    import heapq
    w_audio = float(audio_weight)
    w_text = 1.0 - w_audio
    
    total = audio_collection.count()
    if total == 0: return []
    
    resp = audio_collection.get(include=["embeddings"], limit=total)
    ids = resp.get("ids", [])
    audio_embeddings = resp.get("embeddings", [])
    
    text_resp = text_collection.get(ids=ids, include=["embeddings"])
    text_emb_map = {i: e for i, e in zip(text_resp.get("ids", []), text_resp.get("embeddings", []))}
    
    A_mat = np.array(audio_embeddings, dtype=float)
    T_mat = np.array([text_emb_map.get(cid, np.zeros_like(A_mat[0])) for cid in ids], dtype=float)
    
    E_C_mat = w_audio * A_mat + w_text * T_mat
    norms = np.linalg.norm(E_C_mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    E_C_mat /= norms
    sim_matrix = np.dot(E_C_mat, E_C_mat.T)
    dist_matrix = 2.0 - 2.0 * sim_matrix
    
    try:
        source_idx = ids.index(source_id)
        dest_idx = ids.index(dest_id)
    except ValueError:
        return []
        
    # Build k-NN graph EXACTLY like the UI layout (top_k=5)
    top_k = 5
    graph = {i: [] for i in range(len(ids))}
    for i in range(len(ids)):
        neighbors = np.argsort(sim_matrix[i])[-(top_k+1):]
        for n in neighbors:
            if n != i:
                graph[i].append(n)
                
    # A* Search / Dijkstra Geodesic Pathfinding
    distances = {i: float('inf') for i in range(len(ids))}
    distances[source_idx] = 0
    previous = {i: None for i in range(len(ids))}
    pq = [(0, source_idx)]
    
    while pq:
        current_dist, current_node = heapq.heappop(pq)
        
        if current_node == dest_idx:
            break
            
        if current_dist > distances[current_node]:
            continue
            
        for neighbor in graph[current_node]:
            cost = dist_matrix[current_node, neighbor]
            new_dist = current_dist + cost
            
            if new_dist < distances[neighbor]:
                distances[neighbor] = new_dist
                previous[neighbor] = current_node
                heapq.heappush(pq, (new_dist, neighbor))
                
    path_ids = []
    curr = dest_idx
    while curr is not None:
        path_ids.append(curr)
        curr = previous[curr]
    path_ids.reverse()
    
    # We remove source and dest from intermediate results
    if len(path_ids) >= 2:
        path_ids = path_ids[1:-1]
    else:
        path_ids = []
        
    # Cap to n_steps if the geodesic path happens to be longer
    if len(path_ids) > n_steps:
        # Sample or take first N
        # Taking evenly spaced steps
        indices = np.linspace(0, len(path_ids)-1, n_steps, dtype=int)
        path_ids = [path_ids[i] for i in indices]
        
    results = []
    for idx in path_ids:
        results.append({
            "id": ids[idx],
            "sim_combined": float(sim_matrix[idx, dest_idx])
        })
        
    return results

def generate_graph_data(audio_collection, text_collection, top_k: int = 5, audio_weight: float = 0.5) -> Dict:
    """Generate nodes and links for the entire dataset to render a force-directed graph."""
    total = audio_collection.count()
    if total == 0:
        return {"nodes": [], "links": []}
        
    resp = audio_collection.get(include=["embeddings", "metadatas"], limit=total)
    ids = resp.get("ids", [])
    audio_embeddings = resp.get("embeddings", [])
    metadatas = resp.get("metadatas", [])
    
    text_resp = text_collection.get(ids=ids, include=["embeddings"])
    text_emb_map = {i: e for i, e in zip(text_resp.get("ids", []), text_resp.get("embeddings", []))}
    
    nodes = []
    for i, cid in enumerate(ids):
        m = metadatas[i] or {}
        nodes.append({
            "id": cid,
            "title": m.get("title", "Unknown"),
            "artist": m.get("artist", "Unknown"),
            "videoId": cid.replace("yt:", "")
        })
        
    A_mat = np.array(audio_embeddings, dtype=float)
    T_mat = np.array([text_emb_map.get(cid, np.zeros_like(A_mat[0])) for cid in ids], dtype=float)
    
    candidate_m = min(100, len(ids))
    
    # 1. First-Stage Retrieval (Simulating O(log N) ANN Index fetch)
    sim_a_matrix = np.dot(A_mat, A_mat.T)
    sim_t_matrix = np.dot(T_mat, T_mat.T)
    
    links = []
    
    for i in range(len(ids)):
        # Get Candidate Pool of size 2*M
        top_a = np.argsort(sim_a_matrix[i])[-candidate_m:]
        top_t = np.argsort(sim_t_matrix[i])[-candidate_m:]
        candidate_indices = list(set(top_a).union(set(top_t)))
        
        # 2. Candidate Reranking Stage (Exact Early Fusion)
        E_q = audio_weight * A_mat[i] + (1.0 - audio_weight) * T_mat[i]
        norm_q = np.linalg.norm(E_q)
        if norm_q > 0: E_q /= norm_q
        
        reranked = []
        for j in candidate_indices:
            if i == j: continue
            E_c = audio_weight * A_mat[j] + (1.0 - audio_weight) * T_mat[j]
            norm_c = np.linalg.norm(E_c)
            if norm_c > 0: E_c /= norm_c
            
            score = float(np.dot(E_q, E_c))
            reranked.append((j, score))
            
        reranked.sort(key=lambda x: x[1], reverse=True)
        top_neighbors = reranked[:top_k]
        
        for j, score in top_neighbors:
            links.append({
                "source": ids[i],
                "target": ids[j],
                "score": score
            })
            
    return {"nodes": nodes, "links": links}

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
