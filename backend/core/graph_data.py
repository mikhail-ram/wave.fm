import numpy as np
from typing import Dict

def generate_graph_data(
    audio_collection, 
    text_collection, 
    top_k: int = 5, 
    audio_weight: float = 0.5
) -> Dict:
    """
    Generates the 2D constellation map for the user interface.
    
    For every song in the database, it finds its Top 5 closest neighbors 
    using the hybrid audio/lyric coordinates. It returns these connections 
    as nodes and links so the frontend physics engine can organize them 
    into clusters.
    """
    total = audio_collection.count()
    if total == 0:
        return {"nodes": [], "links": []}
        
    resp = audio_collection.get(include=["embeddings", "metadatas"], limit=total)
    ids = resp.get("ids", [])
    audio_embeddings = resp.get("embeddings", [])
    metadatas = resp.get("metadatas", [])
    
    text_resp = text_collection.get(ids=ids, include=["embeddings"])
    text_emb_map = {
        i: e for i, e in zip(text_resp.get("ids", []), text_resp.get("embeddings", []))
    }
    
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
    
    # First-Stage Retrieval
    sim_a_matrix = np.dot(A_mat, A_mat.T)
    sim_t_matrix = np.dot(T_mat, T_mat.T)
    
    links = []
    
    for i in range(len(ids)):
        top_a = np.argsort(sim_a_matrix[i])[-candidate_m:]
        top_t = np.argsort(sim_t_matrix[i])[-candidate_m:]
        candidate_indices = list(set(top_a).union(set(top_t)))
        
        # Candidate Reranking Stage
        E_q = audio_weight * A_mat[i] + (1.0 - audio_weight) * T_mat[i]
        norm_q = np.linalg.norm(E_q)
        if norm_q > 0: 
            E_q /= norm_q
        
        reranked = []
        for j in candidate_indices:
            if i == j: 
                continue
            E_c = audio_weight * A_mat[j] + (1.0 - audio_weight) * T_mat[j]
            norm_c = np.linalg.norm(E_c)
            if norm_c > 0: 
                E_c /= norm_c
            
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
