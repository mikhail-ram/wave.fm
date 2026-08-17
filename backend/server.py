import json
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

# Import logic from app.py
from app import recommend_similar_tracks, audio_collection, text_collection, _get_nth_id

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TrackRecommendation(BaseModel):
    id: str # Full song ID like yt:xxxx
    videoId: str # Just the YouTube ID
    title: str
    artist: str
    score: int

class RecommendationResponse(BaseModel):
    query_track: dict
    recommendations: List[TrackRecommendation]

@app.get("/api/recommend", response_model=RecommendationResponse)
def get_recommendations(query_id: Optional[str] = None, audio_weight: float = 0.5):
    try:
        # If no query_id provided, pick a random one
        if not query_id:
            query_id = _get_nth_id(audio_collection)
            
        top_results = recommend_similar_tracks(
            audio_collection=audio_collection,
            text_collection=text_collection,
            query_id=query_id,
            candidate_n=50,
            top_k=10,
            audio_weight=audio_weight,
        )
        
        # Fetch metadata from ChromaDB
        all_ids = [item["id"] for item in top_results]
        all_ids.append(query_id)
        
        meta_resp = audio_collection.get(ids=all_ids, include=["metadatas"])
        db_metadata = {}
        for i, m in zip(meta_resp.get("ids", []), meta_resp.get("metadatas", [])):
            if m:
                db_metadata[i] = {
                    "title": m.get("title", "Unknown"),
                    "artist": m.get("artist", "Unknown")
                }
            else:
                db_metadata[i] = {"title": "Unknown", "artist": "Unknown"}
        
        recommendations = []
        for item in top_results:
            cid = item["id"]
            video_id = cid.replace("yt:", "")
            meta = db_metadata.get(cid, {"title": "Unknown", "artist": "Unknown"})
            
            # Map score to something more human readable, e.g., 0-100.
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
    try:
        from app import interpolate_tracks
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
                id=cid, videoId=cid.replace("yt:", ""),
                title=meta["title"], artist=meta["artist"], score=score_val
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

@app.get("/api/graph")
def get_graph():
    try:
        from app import generate_graph_data
        # We cache this in memory since it's expensive to compute on every request
        global cached_graph_data
        if 'cached_graph_data' not in globals():
            cached_graph_data = generate_graph_data(audio_collection, text_collection, top_k=7)
        return cached_graph_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
