# wave.fm

wave.fm is a spatial music exploration tool. It visualizes your music library as a 3D graph, mapping relationships between songs based on their sonic properties and lyrical themes. 

Rather than relying on human-curated playlists or basic metadata, wave.fm uses machine learning to construct a navigable universe of sound, allowing both casual listeners and active users to traverse genres smoothly.

## The Machine Learning Representation
At its core, wave.fm is built on high-dimensional vector embeddings. 

The backend processing pipeline ingests tracks, analyzes their raw audio signals, and parses their lyrics. These features are translated into dense semantic vectors and stored in a vector database (ChromaDB). 

By calculating the cosine similarity between these vectors, we construct a massive k-Nearest Neighbors (k-NN) graph. In this architecture, an edge between two songs means they are mathematically similar—either sonically, lyrically, or both. This allows us to map the entire library into a continuous latent space and project it as an interactive 3D constellation.

## Features

* **Discover:** A passive listening mode. You start at a song, and an autonomous "Autopilot" walks the graph, indefinitely queuing the most mathematically similar connected track.
* **Route:** An active pathfinding engine. Select a starting song and a destination song. By adjusting the "Gravity Modifier", you can tell the engine to heavily weight Audio embeddings or Lyric embeddings. The backend runs an A* search algorithm across the graph to generate the optimal playlist that bridges the two tracks smoothly.
* **Expedition:** A gamified music discovery loop. The universe's map goes dark (Fog of War). You dock at a "Beacon" (a node with high in-degree connectivity) and are assigned a distant target node. You must navigate the graph manually, jumping from node to node using only your intuition and the audio previews of adjacent songs to find your way to the target.

## Tech Stack
* **Frontend:** React, TypeScript, TailwindCSS, Three.js (react-force-graph)
* **Backend:** Python, FastAPI, ChromaDB, NetworkX
* **Data Sources:** YouTube Player API (playback), iTunes Search API (album art)

## Running Locally

1. **Backend:**
   First, activate your virtual environment, then run the Python server script (which spins up the Uvicorn ASGI server internally):
   ```bash
   # From the project root
   source venv/bin/activate  # Or your specific venv activation command
   cd backend
   python server.py
   ```

2. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Documentation
Additional architecture notes, game loop designs, and state machine diagrams can be found in the `/docs` folder.
