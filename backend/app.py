import random
from pathlib import Path

import chromadb
import numpy as np

base_dir = Path(__file__).resolve().parent
persist_dir = base_dir / "db"
persist_dir.mkdir(parents=True, exist_ok=True)
PERSIST_DIR = str(persist_dir)

client = chromadb.PersistentClient(path=PERSIST_DIR)

audio_collection = client.get_collection(name="tracks")
text_collection = client.get_collection(name="text_embeddings")

all_ids = audio_collection.get(include=[], limit=audio_collection.count())["ids"]
index = random.randint(0, len(all_ids))

query_id = all_ids[index]
print(f"Query ID: {query_id}")
query_audio = audio_collection.get(ids=query_id, include=["metadatas", "embeddings"])[
    "embeddings"
][0]
query_text = text_collection.get(ids=query_id, include=["metadatas", "embeddings"])[
    "embeddings"
][0]

candidate_n = 50

results_audio = audio_collection.query(
    query_embeddings=query_audio, n_results=candidate_n, include=[]
)
results_text = text_collection.query(
    query_embeddings=query_text, n_results=candidate_n, include=[]
)

candidate_ids = list(dict.fromkeys(results_audio["ids"][0] + results_text["ids"][0]))

a_get = audio_collection.get(ids=candidate_ids, include=["embeddings"])
t_get = text_collection.get(ids=candidate_ids, include=["embeddings"])
audio_map = {i: e for i, e in zip(a_get["ids"], a_get["embeddings"])}
text_map = {i: e for i, e in zip(t_get["ids"], t_get["embeddings"])}

results = []
alpha = 0.5
for id_ in candidate_ids:
    sim_a = float(np.dot(query_audio, audio_map[id_])) if id_ in audio_map else 0.0
    sim_t = float(np.dot(query_text, text_map[id_])) if id_ in text_map else 0.0
    combined = alpha * sim_a + (1.0 - alpha) * sim_t
    results.append((id_, combined, sim_a, sim_t))

results = [result for result in results if result[0] != query_id]
results.sort(key=lambda x: x[1], reverse=True)

top_k = 3
print(results[:top_k])
