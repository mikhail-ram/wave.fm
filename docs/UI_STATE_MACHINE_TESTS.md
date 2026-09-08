# Wave.fm UI State Machine Testing Plan

Testing an interactive spatial UI rendered inside a `<canvas>` element using traditional E2E frameworks (like Cypress or Playwright) is notoriously difficult because you cannot use simple DOM queries (`cy.get('#node-1').click()`) to interact with the nodes.

However, the UI state machine is highly deterministic. The visual graph is a pure function of the React state. By abstracting the core logic into unit tests, we can guarantee bulletproof edge-case handling.

## 1. Test Architecture
We decouple the "Node Click" interaction from the "Canvas". `Index.tsx` exposes internal state reducer logic (or custom hooks) that handles:
- `handleNodeSingleClick(node)`
- `executeJump(node)`
- `setActiveTab(tab)`

The test suite will inject mock nodes and assert the resulting state (`isJourneyActive`, `sourceTrackId`, `destTrackId`, `manualTargetId`).

## 2. Edge Case Matrix & Expected Assertions

### Discover Mode (Free Flight)
**Test 1: Single Click Override**
- *Initial State:* `activeTab` = 'discover', `currentTrack` = A, `manualTargetId` = null.
- *Action:* `handleNodeSingleClick(B)`
- *Expected:* `manualTargetId` = B, `currentTrack` = A (uninterrupted).

**Test 2: Double Click Jump**
- *Initial State:* `activeTab` = 'discover', `currentTrack` = A.
- *Action:* `executeJump(B)`
- *Expected:* `currentTrack` = B, `manualTargetId` = null, `sourceTrackId` = B.

### Interpolate Mode (In Transit)
**Test 3: The "Reverse/Parked" Edge Case**
- *Initial State:* `activeTab` = 'interpolate', `sourceTrackId` = A, `destTrackId` = C, `highlightedPathIds` = [A, B, C].
- *Action:* `executeJump(B)` -> user is on bridge.
- *Assertion:* `isJourneyActive` evaluates to TRUE.
- *Action 2:* `executeJump(A)` -> user reverses back to start.
- *Assertion:* `isJourneyActive` evaluates to FALSE. (Sliders unlock).

**Test 4: Off-Path Double Click (Eject & Jump)**
- *Initial State:* `activeTab` = 'interpolate', `sourceTrackId` = A, `destTrackId` = C, `highlightedPathIds` = [A, B, C].
- *Action:* `executeJump(D)` (where D is not in path).
- *Expected:* `destTrackId` = "", `highlightedPathIds` = [], `currentTrack` = D, `activeTab` = 'discover' (ejected to free flight).

**Test 5: On-Path Double Click (Fast-Forward)**
- *Initial State:* `activeTab` = 'interpolate', `sourceTrackId` = A, `destTrackId` = D, `highlightedPathIds` = [A, B, C, D].
- *Action:* `executeJump(C)`
- *Expected:* `currentTrack` = C. `isJourneyActive` evaluates to TRUE. `highlightedPathIds` remains intact.

**Test 6: Tab Switching Mid-Journey**
- *Initial State:* `activeTab` = 'interpolate', `currentTrack` = B (mid-journey).
- *Action 1:* `setActiveTab('discover')`.
- *Expected:* `isJourneyActive` = FALSE.
- *Action 2:* `setActiveTab('interpolate')`.
- *Expected:* `sourceTrackId` updates to B. `destTrackId` remains C. (Journey recalculates from current location).

## 3. Automation Strategy
To fully automate this:
1. Extract the state logic from `Index.tsx` into a custom hook: `useWaveStateMachine()`.
2. Write a Jest/Vitest suite `ui_state_machine.test.ts` that initializes `useWaveStateMachine()`.
3. The tests programmatically call `hook.current.executeJump(mockNode)` and assert the outputs against the Matrix above.
4. Add `vitest` to CI/CD pipeline so any future UI upgrades must pass this entire edge-case suite to prevent regressions.
