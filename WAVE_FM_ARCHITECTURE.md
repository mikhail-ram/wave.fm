# wave.fm Architecture & Algorithm Reference

This document serves as a plain-English reference for the wave.fm codebase, explaining the architecture, how the mathematical space works, and why specific algorithms were chosen for each feature.

## Project Structure (Master Index)

The project is divided into a React frontend and a FastAPI backend, both communicating via standard REST APIs.

### Backend (`backend/`)
The backend is a pure functional Python application powered by FastAPI and ChromaDB. It has been modularized into a `core` package for clean separation of concerns.

*   `server.py`: The main entry point. Defines the FastAPI app, CORS middleware, and REST endpoints (`/api/recommend`, `/api/interpolate`, `/api/graph`, `/api/search`). It orchestrates calls to the `core` modules.
*   `core/db.py`: Singleton manager for the ChromaDB connection. Instantiates the persistent client and exposes the audio and text collections.
*   `core/utils.py`: Pure helper functions for database querying (`get_single_embedding`, `fetch_embeddings_map`) and mathematical operations (`dot_product`).
*   `core/recommend.py`: Contains `recommend_similar_tracks`. Implements the **Early Fusion** nearest-neighbor search for the Discover tab.
*   `core/pathfind.py`: Contains `interpolate_tracks`. Implements the **Geodesic Pathfinding (A*)** algorithm for the Interpolate tab.
*   `core/graph_data.py`: Contains `generate_graph_data`. Pre-calculates the k-NN layout for the entire universe so the frontend physics engine can render the background map.
*   `tests/`: Pytest suite verifying the pure mathematical logic in the core modules.

### Frontend (`frontend/`)
A React application built with Vite, TypeScript, and TailwindCSS.

*   `src/App.tsx`: The main React component wrapping the application.
*   `src/components/GraphCanvas.tsx`: The heart of the UI. Uses `react-force-graph` to render the 2D universe of songs based on the k-NN springs calculated by the backend.
*   `src/components/BottomNavigation.tsx`: The main navigation bar allowing users to switch tabs.
*   `src/components/CurrentTrack.tsx`: UI for displaying the currently selected track and playing audio.
*   `src/components/RecommendationCard.tsx` / `RecommendationList.tsx`: Displays the grid of similar tracks returned by the backend.

---

## The Universe (The 1024-D Latent Space)
Every song in our database is analyzed by AI and converted into a list of 1,024 numbers. You can think of this like GPS coordinates, but instead of just X, Y, and Z (3 dimensions), there are 1,024 dimensions. 
*   **Audio Embeddings:** Describe how the song *sounds* (tempo, instruments, genre).
*   **Text Embeddings:** Describe what the song *is about* (lyrics, mood, themes).

When the user adjusts the `[AUDIO:LYRICS]` gravity slider, we perform **Early Fusion**. This means we mathematically mix the Audio GPS coordinates and the Text GPS coordinates into a single, unified "Hybrid" coordinate before doing any math. This ensures that every operation in the app is searching through a single, mathematically pure space.

---

## 1. The Constellation Map (Background UI)
**File:** `backend/core/graph_data.py`

**The Algorithm: k-Nearest Neighbor (k-NN) Graph**
For every single song in the database, the algorithm calculates its distance to every other song using the Hybrid coordinates. It takes the Top 5 closest songs and creates a "spring" (edge) connecting them. 

**The Justification:**
We pass these springs to the frontend (`react-force-graph`), which uses a physics engine to pull connected songs together and push unconnected songs apart. Because it only uses the Top 5 strongest connections, songs naturally clump together into beautiful, distinct clusters (like galaxies) rather than pulling into one giant messy ball.

---

## 2. The Discover Tab
**File:** `backend/core/recommend.py`

**The Algorithm: Exact Nearest Neighbor Search (Early Fusion)**
When you select a song, the app mathematically mixes its Audio and Text coordinates based on your slider preference. It then measures the distance from this custom coordinate to every other song in the universe and returns the absolute closest ones.

**Comparison against alternatives:**
Originally, the app used "Late Fusion" (finding the best audio matches, finding the best text matches separately, and then averaging the lists). We abandoned this because it was slow and inaccurate. Early Fusion (mixing the coordinates *before* searching) guarantees that we find songs that are perfectly balanced in both sound and meaning.

---

## 3. The Interpolate Tab (The Bridge)
**File:** `backend/core/pathfind.py`

**The Algorithm: Geodesic Pathfinding (A* Search on the k-NN Graph)**
When you want to travel from a Country song to a Rap song, you need a bridge of intermediate songs that smoothly transition between them.

**The Justification & History:**
1.  **Attempt 1: Linear Interpolation (Ghost Points).** We mathematically drew a perfectly straight line between the two songs and picked whatever songs were closest to that line. 
    *   *The Problem:* The universe of songs is clustered. A straight line often cuts through empty voids where no songs exist. To satisfy the line, the math grabbed random, unrelated songs from far away, causing the music to sound jarring and the visual UI to draw messy, tangling lines across the screen.
2.  **Attempt 2: Path-Dependent Markov Chains.** We added a penalty to stop the algorithm from jumping across empty voids.
    *   *The Problem:* It required arbitrary, manual weight values (like `1.5`) which wasn't mathematically pure.
3.  **Final Solution: Geodesic Pathfinding.** Instead of drawing a straight line through the void, we use an A* pathfinding algorithm to "walk" across the exact same Top 5 springs that the 2D constellation uses. 

By forcing the algorithm to only take steps along existing physical connections, we guarantee two things:
1.  **Musical Smoothness:** The transition naturally hops from cluster to cluster (e.g., Country -> Folk -> Acoustic Pop -> R&B -> Rap) without ever jumping into the abyss.
2.  **Visual Perfection:** Because it strictly uses the exact same edges drawn by the user interface, it is geometrically impossible for the bridge line to cross itself, tangle, or look messy. It flawlessly traces the glowing web of the constellation. 

If the shortest path through the web only requires 4 steps, but the user asked for 10 on the slider, the backend mathematically returns the optimal 4 steps, and the frontend elegantly displays a `SIGNAL DEGRADED` warning to inform the user.

## 5. User Interaction Architecture (The State Machine)

Apple's design philosophy of "Progressive Disclosure of Intent" drives the UI interaction within the spatial canvas.

### The Input Paradigm
- **Hover:** "Peek". Highlights a node and reveals its metadata tooltip without any state commitment.
- **Single-Click:** "Target / Queue". A low-commitment action. In Discover mode, it manually moves the crosshair to the clicked node (overriding the algorithmic closest-neighbor) without interrupting the currently playing song. In Interpolate mode, it safely inspects a node without destroying the active bridge.
- **Double-Click:** "Execute / Jump". A high-commitment action. Instantly interrupts playback and teleports the ship to the clicked node. If the node is off-path during an Interpolate journey, a double-click acts as an emergency "Eject", shattering the route, dropping the destination, and kicking the user back into Discover mode.

### The "Reverse / Parked" Edge Case
If a user is actively on a bridge (e.g., node B of A -> B -> C) and double-clicks the original source node (A), the system recognizes the user has "reversed" back to the starting line. Because they are parked at the origin, `isJourneyActive` evaluates to false, and the navigation sliders unlock, allowing them to recalibrate the route before setting off again.

### UI Automation Testing
Testing `<canvas>` nodes via E2E frameworks (like Cypress) is virtually impossible via DOM queries. Therefore, the UI state machine edge cases are fully documented and intended for headless React Hook testing (e.g., via Vitest). See `UI_STATE_MACHINE_TESTS.md` for the comprehensive edge-case matrix mapping all possible user interactions.
