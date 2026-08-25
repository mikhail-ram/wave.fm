import heapq
import numpy as np
from typing import Dict, List

def interpolate_tracks(
    audio_collection,
    text_collection,
    source_id: str,
    dest_id: str,
    n_steps: int,
    audio_weight: float = 0.5,
) -> List[Dict]:
    """
    Finds a smooth, step-by-step musical journey between two songs using 
    Geodesic Pathfinding (A* / Dijkstra). It treats the database like a 
    physical constellation, hopping from neighbor to neighbor to find the 
    shortest physical path along the existing cluster of songs.
    """
    w_audio = float(audio_weight)
    w_text = 1.0 - w_audio
    
    total = audio_collection.count()
    if total == 0: 
        return []
    
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
    
    if len(path_ids) >= 2:
        path_ids = path_ids[1:-1]
    else:
        path_ids = []
        
    if len(path_ids) > n_steps:
        indices = np.linspace(0, len(path_ids)-1, n_steps, dtype=int)
        path_ids = [path_ids[i] for i in indices]
        
    results = []
    for idx in path_ids:
        results.append({
            "id": ids[idx],
            "sim_combined": float(sim_matrix[idx, dest_idx])
        })
        
    return results
