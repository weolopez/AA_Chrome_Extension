# Integration Plan: External Chat Component

## Objective
Integrate features from the external `../chat-component` project into this Chrome Extension, starting with its advanced UI.

## Proposed Phased Plan

### Phase 1: UI Upgrade (Keep Existing Backend)
- **Goal:** Replace current chat UI with the external component's UI, using our existing worker framework (OpenAI API calls).
- **Steps:**
    1. Copy relevant UI source files from `../chat-component/src/` and `chat-component.js` into `./wc/advanced-chat/`.
    2. Update `side_pane.html` to use the new component tag (e.g., `<advanced-chat-component>`).
    3. Adapt the copied component's JS:
        - Send outgoing messages via our existing router/event system.
        - Listen for existing `agent-message` events for incoming messages.
        - Disable/remove internal WebLLM worker communication.
    4. Address dependency loading (CDN vs. bundling for Extension CSP).
    5. Verify styling within the side panel.

### Phase 2: Memory System Upgrade (Completed - 2025-04-05)
- **Goal:** Replace `worker/cache.js` with the external component's vector-based memory system.
- **Status:** Done. Copied memory libs (`entity-db.js`, `memory-manager.js`, model files), created `memory-worker.js`, updated `openai.js` to use context via the new worker, updated router, installed dependencies (`idb`, `@xenova/transformers`), updated CSP, and removed `cache.js`.

### Phase 3: Explore WebLLM (Optional/Alternative - Post-Phase 1)
- **Goal:** Evaluate switching to in-browser LLM inference.
- **Requires:** Major architectural changes, model download handling, hardware considerations.

## TODO for Review (@User)

- [ ] **Approve Phase 1:** Agree to prioritize UI upgrade first?
- [ ] **File Location:** OK with copying files into `wc/advanced-chat/`?
- [ ] **Adaptation Strategy:** Agree with modifying the component's communication logic as described?
- [ ] **Dependency Handling:** Acknowledge need to investigate CDN/bundling for dependencies?
- [ ] **Future Phases:** Confirm Phase 2/3 are subsequent considerations?