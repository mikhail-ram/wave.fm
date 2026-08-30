import json
import numpy as np
from pathlib import Path
from backend.core.db import get_audio_collection, get_text_collection

BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "db"
CAPITALS_FILE = DB_DIR / "capital_cities.json"

def compute_in_degrees(k: int = 10, top_n: int = 100, audio_weight: float = 0.5):
    """
    Computes the in-degree for every node in the k-NN graph.
    Selects the top_n nodes as Capital Cities.
    """
    print("Loading collections from ChromaDB...")
    audio_col = get_audio_collection()
    text_col = get_text_collection()
    
    # 1. Fetch all audio embeddings and metadata
    audio_data = audio_col.get(include=["embeddings", "metadatas"])
    ids = audio_data.get("ids", [])
    if not ids:
        print("Database is empty. No capitals to compute.")
        return
        
    num_nodes = len(ids)
    print(f"Loaded {num_nodes} nodes.")
    
    a_embs = np.array(audio_data["embeddings"], dtype=np.float32)
    metadatas = audio_data["metadatas"]
    
    # 2. Fetch lyrics embeddings corresponding to these IDs
    text_data = text_col.get(ids=ids, include=["embeddings"])
    text_emb_map = {
        i: e for i, e in zip(text_data.get("ids", []), text_data.get("embeddings", []))
    }
    
    # 3. Build hybrid embeddings matrix
    # Fallback to audio if text is missing
    t_embs = np.array([text_emb_map.get(cid, a_embs[idx]) for idx, cid in enumerate(ids)], dtype=np.float32)
    
    hybrid_embs = (audio_weight * a_embs) + ((1.0 - audio_weight) * t_embs)
    
    # L2 normalize the hybrid embeddings so dot product = cosine similarity
    norms = np.linalg.norm(hybrid_embs, axis=1, keepdims=True)
    norms[norms == 0] = 1 # Avoid division by zero
    hybrid_embs = hybrid_embs / norms
    
    # 4. Compute pairwise similarities and find top-k neighbors
    # For a graph of 5000 nodes, a 5000x5000 float32 matrix is ~100MB, totally fine in memory.
    print("Computing similarity matrix...")
    similarity_matrix = np.dot(hybrid_embs, hybrid_embs.T)
    
    # 5. Tally in-degrees
    print(f"Tallying in-degrees (k={k})...")
    in_degrees = {cid: 0 for cid in ids}
    
    for i in range(num_nodes):
        # np.argsort sorts ascending. We want the top k (excluding self).
        # We take the last k+1 elements, reverse them, and drop the first one (which is self, sim=1.0)
        neighbors_idx = np.argsort(similarity_matrix[i])[-k-1:][::-1]
        
        for idx in neighbors_idx:
            if idx == i:
                continue # Skip self-loop
            in_degrees[ids[idx]] += 1
            
    # 6. Sort by in-degree descending
    sorted_nodes = sorted(in_degrees.items(), key=lambda x: x[1], reverse=True)
    
    # 7. Extract Top N and format as JSON
    print(f"Extracting Top {top_n} Capital Cities...")
    capital_cities = []
    
    # We need a quick way to look up metadata
    meta_map = {ids[i]: metadatas[i] for i in range(num_nodes)}
    
    for rank, (cid, in_degree) in enumerate(sorted_nodes[:top_n]):
        meta = meta_map[cid] or {}
        capital_cities.append({
            "rank": rank + 1,
            "id": cid,
            "title": meta.get("title", "Unknown"),
            "artist": meta.get("artist", "Unknown"),
            "in_degree": in_degree,
            # We don't save embeddings in the JSON to keep it lightweight.
        })
        
    # 8. Save to file
    DB_DIR.mkdir(parents=True, exist_ok=True)
    with open(CAPITALS_FILE, "w", encoding="utf-8") as f:
        json.dump(capital_cities, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully saved {len(capital_cities)} Capital Cities to {CAPITALS_FILE}")
    print("\nTop 5 Capitals:")
    for city in capital_cities[:5]:
        print(f"  {city['rank']}. {city['title']} by {city['artist']} (In-Degree: {city['in_degree']})")

if __name__ == "__main__":
    compute_in_degrees(k=10, top_n=100)
