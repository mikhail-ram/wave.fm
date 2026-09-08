## Master Implementation Plan: Expeditions

Your roadmap is exactly how professional engineering teams sequence complex features. You never build multiplayer until the single-player core is bulletproof. 

Here is the definitive, step-by-step implementation plan, broken down into verifiable phases. We will execute and git-commit these one at a time.

---

### Phase 1: Database Expansion & Mathematical Ports
**Goal:** Scale the universe and calculate the 100 Capital Cities using Graph Theory.
*   **Action 1:** Update the ingest script to process at least 1,000 to 5,000 tracks (extracting audio, lyrics, and creating UMAP embeddings).
*   **Action 2:** Write a backend Python script that calculates the "In-Degree" of every node in the $k$-NN graph.
*   **Action 3:** Extract the top 100 nodes with the highest in-degree and cache them as `capital_cities.json`.
*   **Verification:** Check the JSON file. Ensure it contains exactly 100 valid, distinct tracks. 
*   **Commit:** `feat(backend): scale database and compute in-degree capital cities`

### Phase 2: UI Overhaul (Minimalism & Playback)
**Goal:** Implement the complex UI mechanics (Perimeter Progress and Context Drawer) before attaching them to game logic.
*   **Action 1:** Implement the "Perimeter Progress Bar" CSS/SVG logic for the square nodes.
*   **Action 2:** Build the sliding "Universal Context Drawer" component (Album Art, Full Audio Scrubber, Lyrics Pane).
*   **Action 3:** Wire the frontend so that hovering/previewing a candidate node updates the Context Drawer with that candidate's data. 
*   **Verification:** Hover over a node, click play. Ensure the square perimeter traces grey over 30 seconds. Verify the drawer instantly swaps lyrics and audio when previewing different nodes.
*   **Commit:** `feat(frontend): add perimeter progress and universal context drawer`

### Phase 3: The Single-Player Game Loop
**Goal:** Build the actual puzzle mechanics (Fog of War, Triangulation, Jumping).
*   **Action 1:** Add the `Expeditions` Tab and Onboarding UI (Select your Capital City).
*   **Action 2:** Write the backend logic to assign a Target (pick another Capital City 5-7 hops away using A*).
*   **Action 3:** Implement Fog of War (only Base and immediate 5 neighbors visible; Target is hidden).
*   **Action 4:** Implement the "Scanner" HUD. Wire the `Audio <--> Lyrics` slider to calculate Cosine Similarity between the hovered candidate and the invisible Target.
*   **Action 5:** Implement `[ JUMP ]` to commit to a node, and instant Fast-Backtracking to previously visited nodes.
*   **Verification:** Play a full route. Ensure the fog updates correctly, backtracking works, and the scanner accurately changes when you switch between Audio/Lyrics.
*   **Commit:** `feat(game): implement expeditions fog of war and scanner loop`

### Phase 4: Route Naming & Legacy
**Goal:** Allow users to name successful expeditions and save them for casual listeners.
*   **Action 1:** Trigger a `[ PIONEER: NAME THIS ROUTE ]` modal upon reaching the Target.
*   **Action 2:** Save the route (Array of Node IDs, Route Name, Creator ID) to a new database table.
*   **Action 3:** Update the `Interpolate` tab to display a list of these Community "Trade Routes" that casual users can click and listen to.
*   **Verification:** Complete an expedition, name the route, verify it saves in the DB, and verify it is playable in the Interpolate tab.
*   **Commit:** `feat(db): save named trade routes and display in interpolate tab`

### Phase 5: Multiplayer & The Parlay (WebSockets)
**Goal:** Introduce live synchronous meetups and map exchanging.
*   **Action 1:** Stand up a lightweight WebSocket server (FastAPI/Socket.io).
*   **Action 2:** Broadcast the `current_node_id` of all active players in the Expeditions tab. Render them as faint blips.
*   **Action 3:** If local player and remote player share the same `current_node_id`, render the `[ PARLAY ]` button.
*   **Action 4:** If both accept, execute "Map Sync" (merge their arrays of visited node IDs and Scanner scores, updating the local Fog of War).
*   **Verification:** Open two browser windows. Navigate both to the same node. Accept the Parlay. Verify Window A's fog clears based on Window B's history.
*   **Commit:** `feat(multiplayer): integrate websockets and chart exchange parlay`

---

### Open Questions
> [!TIP]
> This plan isolates risk. We don't touch WebSockets until the game is proven to be fun in single-player. 

Please review this exact sequence. Does this step-by-step roadmap meet your expectations for a safe, verifiable development process? If approved, we will begin executing Phase 1 immediately.
