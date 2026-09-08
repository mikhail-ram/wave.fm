# Wave.fm UI State Machine & Interaction Paradigm

To guarantee a completely bulletproof, Apple-esque spatial UX, we must strictly separate **Observation** from **Execution**, and clearly define how the user inputs intent.

## Core Interaction Philosophy
1. **Single-Click = Observe / Plan.** Single-clicking a node interacts with the map (UI). It sets targets, previews paths, and frames the camera, but it **never** alters the current audio playback.
2. **Double-Click = Execute / Teleport.** Double-clicking a node interacts with the audio engine. It instantly teleports your physical location in the universe to that node and begins playing it, clearing any pending plans.
3. **Sliders = Universe Manipulation.** Dragging sliders pauses the camera to prevent motion sickness. When the universe settles, the camera smoothly re-frames to show the results of your manipulation.

---

## 1. Discover Mode (The Infinite Walk)

**Goal:** Wander the latent space. The algorithm always queues up the nearest neighbor, but the user can intervene.

### State 1A: Autopilot (Default)
*   **Trigger:** Enter Discover mode without clicking anything.
*   **Visuals:** Camera centered on Active Song. The single mathematically closest neighbor (based on the Audio/Lyric slider) is highlighted with target brackets `[ ]` and a predictive dashed line.
*   **Playback:** The solid geometric arrow slowly fills the dashed line as the song plays. When the song ends, it jumps to the targeted neighbor.
*   **HUD:** `AUTOPILOT: SEEKING OPTIMAL MATCH`.

### State 1B: Inspecting Distant Node
*   **Trigger:** Single-click a node that is **not** immediately connected to the Active Song.
*   **Visuals:** The algorithm's target `[ ]` remains completely unchanged. The dashed line and arrow remain untouched. However, the camera executes a **Dual-Node Zoom-to-Fit**, framing both your Active Song and the distant Inspected Song (plus their neighbors). The Inspected Song's label locks onto the screen.
*   **Intent:** "I want to look at that constellation over there, but don't change my current flight path."
*   **Transitions:** Click background -> Return to Autopilot.

### State 1C: Manual Target Override
*   **Trigger:** Single-click an **immediate neighbor** of the Active Song.
*   **Visuals:** The target brackets `[ ]` and the dashed line snap to the clicked neighbor. The playback arrow immediately re-angles and begins filling toward the new target. Camera executes Dual-Node Zoom-to-Fit.
*   **HUD:** `AUTOPILOT: MANUAL OVERRIDE` with a `[ CLEAR ]` button.
*   **Intent:** "I want to override the algorithm and go to *this* specific neighbor next."
*   **Transitions:** Click `[ CLEAR ]` or click background -> Return to Autopilot.

---

## 2. Interpolate Mode (The Planned Route)

**Goal:** Plot a specific course through the latent space between two distinct points.

### The "Source vs Destination" Edge Case Resolution
**The Problem:** Currently, Interpolate assumes your "Source" is always the song you are currently listening to. If you are listening to A, but want to plot a route from B to C, you are forced to teleport to B first.
**The Solution:** The Interpolate HUD must adopt a "Google Maps" paradigm. 
*   **HUD Elements:** Two input fields: `[ FROM: Current Song ]` and `[ TO: Select Destination ]`.
*   **Selection Focus:** One of these fields is always "Active" (highlighted). By default, `TO` is active. Single-clicking a node on the map assigns that node to the *Active* field. If you want to change the starting point without playing it, you click the `FROM` field in the HUD, then single-click Song B on the map.

### State 2A: IDLE (Selection)
*   **Trigger:** Switch to Interpolate Tab.
*   **Visuals:** Map operates normally. No route is drawn.
*   **Transitions:** Once both `FROM` and `TO` have a node assigned, transition to PREVIEW.

### State 2B: PREVIEW (Route Planning)
*   **Trigger:** Both Source and Destination are selected.
*   **Visuals:** The shortest path between Source and Destination is drawn as a dashed bridge. The camera executes a **Path Zoom-to-Fit**, framing the entire bridge and its neighbors. 
*   **Audio/Playback Decoupling:** If the user is playing Song A, but plotting a route from B to C, the geometric playback arrow remains attached to Song A! The bridge from B to C is purely a visual hologram of the *planned* route.
*   **HUD:** Shows the `[ INITIATE EXPEDITION ]` button. Sliders are **UNLOCKED**.
*   **Transitions:**
    *   Tweak Gravity/Distance Sliders -> Route recalculates. When settled, camera re-frames the new route.
    *   Click `[ INITIATE ]` -> Transitions to LOCKED.

### State 2C: LOCKED (Executing Expedition)
*   **Trigger:** User clicks `[ INITIATE EXPEDITION ]`.
*   **Immediate Action:** If the `FROM` node is different from the currently playing node, the engine instantly **Teleports** the user to the `FROM` node and begins playing it.
*   **Visuals:** The `FROM` node becomes the Active Song. The path solidifies. The playback arrow snaps to the first leg of the bridge. The camera zooms back into the Active Song.
*   **HUD:** Sliders are **DISABLED/LOCKED**. Button changes to `[ ABORT EXPEDITION ]`.
*   **Transitions:**
    *   Double-click a random distant node -> Instantly aborts the journey, teleports, and drops back to Discover mode.
    *   Click `[ ABORT ]` -> Journey cancelled, drops back to Discover mode at the current location.
    *   Reach Destination -> Journey completes. Drops back to Discover mode.

---

## 3. Global Camera & Slider Rules
*   **Physics Isolation:** Whenever a slider is dragged (Gravity or Distance), the camera input is completely disabled. The universe is allowed to stretch, morph, and settle.
*   **The Post-Settle Snap:** The exact millisecond the physics engine signals it has stopped settling, the camera evaluates the current State (Autopilot, Preview, etc.) and executes the appropriate `zoomToFit` or `centerAt` to perfectly re-frame the user's intent.

---

## 4. Cross-View Transitions (Tab Switching)

To ensure the UI never enters an ambiguous or stuck state, switching between the `DISCOVER` and `INTERPOLATE` tabs enforces strict state-reset rules.

### Transition: Discover (1A/1B/1C) -> Interpolate
*   **Action:** User clicks the `INTERPOLATE` tab.
*   **Result:** System enters **State 2A (IDLE)**.
*   **Data Reset:** The `FROM` field is auto-populated with the currently playing track. The `TO` field is empty and marked as the active selection focus. Any pending manual overrides (`manualTargetId`) or camera inspections from Discover mode are instantly cleared.

### Transition: Interpolate IDLE (2A) or PREVIEW (2B) -> Discover
*   **Action:** User clicks the `DISCOVER` tab before initiating a journey.
*   **Result:** System enters **State 1A (Autopilot)**.
*   **Data Reset:** The planned preview route and bridge are instantly cleared. The `FROM` and `TO` selections are wiped. The camera gracefully re-centers on the currently playing track, resuming the infinite walk.

### Transition: Interpolate LOCKED (2C) -> Discover
*   **Action:** User clicks the `DISCOVER` tab while actively executing a locked expedition.
*   **Result:** **Implicit Abort.** System enters **State 1A (Autopilot)**.
*   **Data Reset:** By explicitly leaving the Interpolate view, the user signals they no longer wish to follow the rigid path. The journey is aborted. The rigid dashed bridge disappears. The sliders instantly **UNLOCK**. The system seamlessly resumes standard Discover mode routing, starting from whichever track the user was currently listening to when they switched tabs.

---

## 5. Visual State Matrix & Asset Behaviors

To maintain clarity in a dense visual environment, every element follows strict rendering rules based on the current state.

### 5.1 Node Anatomy
*   **Standard Node (Unexplored):** Hollow black square with a 1.5px white border. Opacity `1.0`. Base size `1.5x`.
*   **Disconnected Node (0 Edges):** Opacity smoothly transitions to `0.0`.
*   **Hovered / Inspected Node:** Size expands to `3.0x`. Hacker text label locks visible.
*   **Active Node (Currently Playing):** Solid white fill. Emits a heavy 10px white glow. Size expands to `4.0x`.
*   **Destination / Target Node:** Remains hollow (signifying it hasn't been explored yet), but border thickens to `3.0px`. Emits an 8px subtle glow. Size expands to `4.0x`.

### 5.2 The HUD Crosshair Brackets `[ ]`
The HTML/CSS target brackets (`crosshairRef`) are decoupled from the canvas nodes. They float over the map and snap to the focal point of the user's impending future.
*   **Discover (State 1A - Autopilot):** Snaps to the algorithm's chosen closest neighbor.
*   **Discover (State 1B - Inspecting):** Remains locked on the algorithm's chosen neighbor. Does *not* move to the inspected node.
*   **Discover (State 1C - Manual Override):** Snaps to the user's manually clicked neighbor.
*   **Interpolate (State 2B/2C):** Snaps to the very next stepping-stone node in the bridge path (or the final Destination node if it's the last step).

### 5.3 Edges (The Latent Connections)
*   **Standard Topology:** `rgba(255, 255, 255, 0.05)`. Barely visible background scaffolding.
*   **Active Topology:** `rgba(255, 255, 255, 0.4)`. Edges illuminate if they are directly connected to the Active Node, Hovered Node, Inspected Node, or Manual Target Node.
*   **Interpolation Dimming:** During Interpolate PREVIEW (2B) and LOCKED (2C), all edges that are *not* part of the bridge path have their opacity mathematically crushed (multiplied by `0.15`) to bring focus to the route.

### 5.4 The Interpolation Bridge (The Route)
The bridge is only drawn in Interpolate Modes (2B & 2C).
*   **Planned/Future Segments:** Drawn as a bright white, `1.5px` thick dashed line (`[4, 4]`) with opacity `1.0`.
*   **Traversed/Past Segments (State 2C only):** As the Active Node progresses along the path, the segments behind it convert to a solid line (no dashes) and dim to opacity `0.5`, leaving a breadcrumb trail.

### 5.5 The Playback Packet (The Arrow)
The "Packet" is the physical representation of the audio currently streaming. It relies on the `playbackProgress` ref (0.0 to 1.0).
*   **Predictive Target Line (Discover Only):** A very faint, highly dashed line (`[2, 4]`, opacity `0.2`) permanently points from the Active Node to whatever node the HUD Crosshair is currently locked onto.
*   **Progress Fill:** A solid, bright white geometric line that grows outward from the Active Node along the Predictive Target Line as the song progresses.
*   **The Arrowhead:** A sharp, solid geometric arrowhead drawn exactly at the tip of the Progress Fill. It emits a subtle 6px glow. It vanishes the millisecond `progress === 1.0` to prevent clipping the target node's border.
*   **Interpolate Override (State 2B - Preview):** The Playback Packet strictly represents the live audio engine. If you are playing Song A, but planning a route from Song B to Song C:
    *   The bridge from B to C will **not** have an arrow on it, because no audio is traversing it yet.
    *   The live arrow will still emerge from Song A (wherever it is on the map). However, because the system is in PREVIEW mode, the live arrow and crosshair will be visually suppressed to `0.4` opacity (with a dimmed shadow) to keep visual focus on your planned bridge, even if the arrow points to a manual override.
    *   *Further Improvement:* The dimming logic could be refined to handle edge cases where the predicted target perfectly overlaps with the bridge but is not yet locked.
    *   Only when you click `[ INITIATE ]` does the audio engine teleport to Song B, at which point the bright, solid arrow snaps to the bridge and begins traversing it.
