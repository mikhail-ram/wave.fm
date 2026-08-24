# wave.fm Architecture & Algorithm Reference

This document serves as a plain-English reference for the wave.fm codebase, explaining how the mathematical space works and why specific algorithms were chosen for each feature.

## The Universe (The 1024-D Latent Space)
Every song in our database is analyzed by AI and converted into a list of 1,024 numbers. You can think of this like GPS coordinates, but instead of just X, Y, and Z (3 dimensions), there are 1,024 dimensions. 
*   **Audio Embeddings:** Describe how the song *sounds* (tempo, instruments, genre).
*   **Text Embeddings:** Describe what the song *is about* (lyrics, mood, themes).

When the user adjusts the `[AUDIO:LYRICS]` gravity slider, we perform **Early Fusion**. This means we mathematically mix the Audio GPS coordinates and the Text GPS coordinates into a single, unified "Hybrid" coordinate before doing any math. This ensures that every operation in the app is searching through a single, mathematically pure space.

---

## 1. The Constellation Map (Background UI)
**File:** `backend/app.py` -> `generate_graph_data`

**The Algorithm: k-Nearest Neighbor (k-NN) Graph**
For every single song in the database, the algorithm calculates its distance to every other song using the Hybrid coordinates. It takes the Top 5 closest songs and creates a "spring" (edge) connecting them. 

**The Justification:**
We pass these springs to the frontend (`react-force-graph`), which uses a physics engine to pull connected songs together and push unconnected songs apart. Because it only uses the Top 5 strongest connections, songs naturally clump together into beautiful, distinct clusters (like galaxies) rather than pulling into one giant messy ball.

---

## 2. The Discover Tab
**File:** `backend/app.py` -> `recommend_similar_tracks`

**The Algorithm: Exact Nearest Neighbor Search (Early Fusion)**
When you select a song, the app mathematically mixes its Audio and Text coordinates based on your slider preference. It then measures the distance from this custom coordinate to every other song in the universe and returns the absolute closest ones.

**Comparison against alternatives:**
Originally, the app used "Late Fusion" (finding the best audio matches, finding the best text matches separately, and then averaging the lists). We abandoned this because it was slow and inaccurate. Early Fusion (mixing the coordinates *before* searching) guarantees that we find songs that are perfectly balanced in both sound and meaning.

---

## 3. The Interpolate Tab (The Bridge)
**File:** `backend/app.py` -> `interpolate_tracks`

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
