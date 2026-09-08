import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import uvicorn

from core.db import get_audio_collection, get_text_collection
from core.utils import get_nth_id
from core.recommend import recommend_similar_tracks
from core.pathfind import interpolate_tracks
from core.graph_data import generate_graph_data

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

audio_collection = get_audio_collection()
text_collection = get_text_collection()

class TrackRecommendation(BaseModel):
    id: str
    videoId: str
    title: str
    artist: str
    score: int

class RecommendationResponse(BaseModel):
    query_track: dict
    recommendations: List[TrackRecommendation]

@app.get("/api/recommend", response_model=RecommendationResponse)
def get_recommendations(query_id: Optional[str] = None, audio_weight: float = 0.5, history: Optional[str] = None):
    """
    API Endpoint: Handles requests from the Discover Tab.
    Takes a song ID and an audio/lyric preference slider value, and returns the most similar songs.
    """
    try:
        # Parse history string into a list of IDs (comma separated)
        history_list = []
        if history:
            history_list = [h.strip() for h in history.split(",") if h.strip()]
            
        if not query_id:
            query_id = get_nth_id(audio_collection)
            
        top_results = recommend_similar_tracks(
            audio_collection=audio_collection,
            text_collection=text_collection,
            query_id=query_id,
            candidate_n=50,
            top_k=10,
            audio_weight=audio_weight,
            history=history_list,
        )
        
        all_ids = [item["id"] for item in top_results] + [query_id]
        meta_resp = audio_collection.get(ids=all_ids, include=["metadatas"])
        
        db_metadata = {}
        for i, m in zip(meta_resp.get("ids", []), meta_resp.get("metadatas", [])):
            if m:
                db_metadata[i] = {"title": m.get("title", "Unknown"), "artist": m.get("artist", "Unknown")}
            else:
                db_metadata[i] = {"title": "Unknown", "artist": "Unknown"}
        
        recommendations = []
        for item in top_results:
            cid = item["id"]
            video_id = cid.replace("yt:", "")
            meta = db_metadata.get(cid, {"title": "Unknown", "artist": "Unknown"})
            score_val = round(item["sim_combined"] * 100)
            
            recommendations.append(TrackRecommendation(
                id=cid, 
                videoId=video_id,
                title=meta["title"],
                artist=meta["artist"],
                score=score_val
            ))
            
        q_video_id = query_id.replace("yt:", "")
        q_meta = db_metadata.get(query_id, {"title": "Unknown", "artist": "Unknown"})
        
        return RecommendationResponse(
            query_track={
                "id": query_id,
                "videoId": q_video_id,
                "title": q_meta["title"],
                "artist": q_meta["artist"]
            },
            recommendations=recommendations
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class InterpolateResponse(BaseModel):
    source_track: dict
    dest_track: dict
    interpolated_tracks: List[TrackRecommendation]

# Build metadata cache for search
all_tracks_cache = []
try:
    total = audio_collection.count()
    if total > 0:
        resp = audio_collection.get(include=["metadatas"], limit=total)
        for i, m in zip(resp.get("ids", []), resp.get("metadatas", [])):
            if m:
                all_tracks_cache.append({
                    "id": i,
                    "videoId": i.replace("yt:", ""),
                    "title": m.get("title", "Unknown"),
                    "artist": m.get("artist", "Unknown")
                })
except Exception as e:
    print(f"Error caching tracks: {e}")

@app.get("/api/search")
def search_tracks(q: str):
    """
    API Endpoint: Handles text searches.
    Quickly searches the local memory cache for songs matching the typed text.
    """
    q = q.lower()
    results = []
    for track in all_tracks_cache:
        if q in track["title"].lower() or q in track["artist"].lower():
            results.append(track)
            if len(results) >= 10:
                break
    return {"results": results}

@app.get("/api/interpolate", response_model=InterpolateResponse)
def get_interpolation(source_id: str, dest_id: str, n_steps: int = 3, audio_weight: float = 0.5):
    """
    API Endpoint: Handles requests from the Interpolate Tab.
    Takes a starting song, an ending song, and the desired bridge length, and calculates a smooth path between them.
    """
    try:
        top_results = interpolate_tracks(
            audio_collection=audio_collection,
            text_collection=text_collection,
            source_id=source_id,
            dest_id=dest_id,
            n_steps=n_steps,
            audio_weight=audio_weight,
        )
        
        all_ids = [item["id"] for item in top_results] + [source_id, dest_id]
        meta_resp = audio_collection.get(ids=all_ids, include=["metadatas"])
        
        db_metadata = {}
        for i, m in zip(meta_resp.get("ids", []), meta_resp.get("metadatas", [])):
            if m:
                db_metadata[i] = {"title": m.get("title", "Unknown"), "artist": m.get("artist", "Unknown")}
            else:
                db_metadata[i] = {"title": "Unknown", "artist": "Unknown"}
                
        recommendations = []
        for item in top_results:
            cid = item["id"]
            meta = db_metadata.get(cid, {"title": "Unknown", "artist": "Unknown"})
            score_val = round(item["sim_combined"] * 100)
            recommendations.append(TrackRecommendation(
                id=cid, 
                videoId=cid.replace("yt:", ""),
                title=meta["title"], 
                artist=meta["artist"], 
                score=score_val
            ))
            
        s_meta = db_metadata.get(source_id, {"title": "Unknown", "artist": "Unknown"})
        d_meta = db_metadata.get(dest_id, {"title": "Unknown", "artist": "Unknown"})
        
        return InterpolateResponse(
            source_track={"id": source_id, "videoId": source_id.replace("yt:", ""), "title": s_meta["title"], "artist": s_meta["artist"]},
            dest_track={"id": dest_id, "videoId": dest_id.replace("yt:", ""), "title": d_meta["title"], "artist": d_meta["artist"]},
            interpolated_tracks=recommendations
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

graph_cache: Dict = {}

@app.get("/api/graph")
def get_graph(audio_weight: float = 0.5):
    """
    API Endpoint: Handles requests to draw the background constellation map.
    Returns all nodes and their top connections. Caches the result so the physics engine loads instantly on refresh.
    """
    try:
        weight_key = round(audio_weight, 2)
        if weight_key not in graph_cache:
            graph_cache[weight_key] = generate_graph_data(
                audio_collection, 
                text_collection, 
                top_k=5, 
                audio_weight=audio_weight
            )
            
        return graph_cache[weight_key]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/capitals")
def get_capitals():
    """
    API Endpoint: Returns the Top 100 Capital Cities for the Expeditions Game.
    Reads from the pre-computed capital_cities.json.
    """
    try:
        from pathlib import Path
        import os
        base_dir = Path(__file__).resolve().parent
        capitals_file = base_dir / "db" / "capital_cities.json"
        
        if not capitals_file.exists():
            return {"capitals": []}
            
        with open(capitals_file, "r", encoding="utf-8") as f:
            capitals = json.load(f)
            
        # Format for frontend response
        formatted_capitals = []
        for city in capitals:
            formatted_capitals.append({
                "id": city["id"],
                "videoId": city["id"].replace("yt:", ""),
                "title": city["title"],
                "artist": city["artist"],
                "rank": city["rank"],
                "in_degree": city["in_degree"]
            })
            
        return {"capitals": formatted_capitals}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/route")
def get_route(start: str, end: str):
    """
    API Endpoint: Runs Breadth-First-Search (BFS) on the 0.5-weight graph
    to find the shortest path (Par Score) between two nodes.
    """
    try:
        from collections import deque
        
        # 1. Get or generate the graph (using 0.5 balanced weight)
        weight_key = 0.5
        if weight_key not in graph_cache:
            graph_cache[weight_key] = generate_graph_data(
                audio_collection, 
                text_collection, 
                top_k=5, 
                audio_weight=weight_key
            )
        graph = graph_cache[weight_key]
        
        # 2. Build adjacency list
        adj_list = {}
        for link in graph["links"]:
            src = link["source"]["id"] if isinstance(link["source"], dict) else link["source"]
            tgt = link["target"]["id"] if isinstance(link["target"], dict) else link["target"]
            if src not in adj_list:
                adj_list[src] = []
            adj_list[src].append(tgt)
            
        # 3. BFS
        if start not in adj_list and start not in [n["id"] for n in graph["nodes"]]:
            raise HTTPException(status_code=404, detail="Start node not found in graph.")
        if end not in adj_list and end not in [n["id"] for n in graph["nodes"]]:
            raise HTTPException(status_code=404, detail="End node not found in graph.")
            
        queue = deque([(start, [start])])
        visited = set([start])
        
        while queue:
            current, path = queue.popleft()
            
            if current == end:
                return {
                    "path": path,
                    "par_score": len(path) - 1
                }
                
            for neighbor in adj_list.get(current, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, path + [neighbor]))
                    
        return {"path": [], "par_score": -1} # No path found
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/track/{track_id}")
def get_track_details(track_id: str):
    """
    API Endpoint: Returns full track details including lyrics.
    """
    try:
        # Fetch metadata from audio collection
        audio_resp = audio_collection.get(ids=[track_id], include=["metadatas"])
        if not audio_resp or not audio_resp.get("ids") or len(audio_resp["ids"]) == 0:
            raise HTTPException(status_code=404, detail="Track not found")
            
        metadata = audio_resp["metadatas"][0]
        title = metadata.get("title", "Unknown")
        artist = metadata.get("artist", "Unknown")
        
        lyrics = "No lyrics available."
        
        # Read from ingestion_ledger.json
        from pathlib import Path
        import json
        ledger_path = Path(__file__).resolve().parent / "db" / "ingestion_ledger.json"
        
        if ledger_path.exists():
            with open(ledger_path, "r", encoding="utf-8") as f:
                ledger = json.load(f)
            
            # Find the track in ledger by matching song_id
            for key, data in ledger.items():
                if data.get("song_id") == track_id:
                    if "lyrics_text" in data and data["lyrics_text"]:
                        lyrics = data["lyrics_text"]
                    break
                
        return {
            "id": track_id,
            "title": title,
            "artist": artist,
            "videoId": metadata.get("videoId", ""),
            "lyrics": lyrics
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
