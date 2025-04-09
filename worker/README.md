# Worker Framework Documentation

This directory contains the implementation of a SharedWorker-based framework designed for handling background tasks within the Chrome Extension. It utilizes a central router and specialized workers to manage communication, process data, interact with external APIs, and persist information.

## Core Concepts

The framework revolves around a few key ideas:

1.  **Shared Workers:** Most components are implemented as `SharedWorker`s. This allows multiple parts of the extension (e.g., background script, side panel, popup) to connect to and share the same worker instances, conserving resources and enabling shared state/functionality.
2.  **Central Router (`router.js`):** A dedicated `WorkerRouter` acts as the main communication hub. The main application script connects primarily to this router.
3.  **Specialized Workers:** Individual workers handle specific tasks (e.g., API calls, caching, command processing).
4.  **Registration:** Specialized workers register themselves with the `WorkerRouter` upon startup.
5.  **Message-Based Communication:** Components communicate by posting messages through `MessagePort`s using a standardized **Communication Envelope**. This envelope includes sender identification (`name`) and uses a chain-based `requestId` for tracing. See the "Worker Communication Envelope" section below for details. When the payload represents a chat message, it follows the **Open Message Format (OMF)** schema.
6.  **Base Class (`base.js`):** A `BaseWorker` class provides common functionality (connection setup, basic configuration handling, communication envelope posting including sender name, `requestId` helpers) inherited by most specialized workers.
7.  **Memory Management (`memory-worker.js`):** A dedicated worker uses `MemoryManager` (which uses IndexedDB) to store messages with contextual metadata and provides retrieval/management functions.

## Worker Communication Envelope

This framework uses a standardized envelope structure for all messages passed between the UI, Router, and Workers via `postMessage`. This ensures consistency and provides necessary metadata for routing and tracing.

**Envelope Structure:**

```json
{
  "type": "string",
  "name": "string",
  "requestId": "string | undefined",
  "payload": "object"
}
```

-   **`type` (String, Required):** Defines the purpose or category of the envelope message (e.g., `command`, `response`, `error`, `status`, `config`, `user-message`, `agent-message`, `forward`). This dictates how the recipient should interpret the payload and overall message.
-   **`name` (String, Required):** **Identifies the sender component** of this envelope message (e.g., "MemoryWorker", "OpenAIWorker", "Router", "MainUI"). Automatically added by `BaseWorker.postMessage`. Essential for logging and context.
-   **`requestId` (String, Optional):** A **chain-based identifier** used for end-to-end tracing and internal request/response routing.
    -   **Structure:** `<user_request_id>[:<task_id_1>[:<task_id_2>...]]`
    -   **Generation:** Initial `<user_request_id>` by UI; subsequent `<task_id>` appended by components initiating tracked sub-requests.
    -   **Propagation:** The full, current `requestId` chain is included in requests and their corresponding responses.
    -   **Purpose:** Tracing operations back to the user and enabling router response mapping.
-   **`payload` (Object, Required):** Contains the actual data relevant to the message `type`. The structure of the payload depends entirely on the `type`.

### Payload Content and OMF Chat Messages

-   The structure of the `payload` object varies based on the envelope `type`. For example:
    -   If `type` is `command`, the `payload` might contain `{ command: 'addMessage', data: {...} }`.
    -   If `type` is `response`, the `payload` contains the result data.
    -   If `type` is `error`, the `payload` contains `{ error: 'Error message' }`.
-   **Open Message Format (OMF) for Chat Payloads:** When the `payload` represents an actual chat message (typically from the user or an AI assistant, often within a `user-message` or `response` envelope), the **payload itself** should conform to the OMF chat message schema:
    ```json
    // Example: Payload for type: 'user-message' or type: 'response' containing chat content
    "payload": {
      "role": "user | assistant | system",
      "content": "string | array", // Text or array of content items
      "name": "string | undefined" // Optional: Name of the entity sending the chat message (e.g., user's name)
    }
    ```
    *Note: The top-level envelope `name` identifies the *component* sending the message (e.g., "MainUI", "OpenAIWorker"), while the OMF `name` *inside the payload* identifies the *author* of the chat content (e.g., "Alice").*

**Example Envelope (UI sending user chat message):**
```json
{
  "type": "user-message", // Envelope type
  "name": "MainUI",       // Envelope sender
  "requestId": "user-a1b2c3",
  "payload": {           // Payload conforming to OMF Chat Message schema
    "role": "user",
    "content": "Explain quantum physics",
    "name": "Bob"       // Optional: User's name
  }
}
```

**Example Envelope (Forward Request - OpenAIWorker asks MemoryWorker via Router):**
```json
// Message sent from OpenAIWorker to Router
{
  "type": "forward",
  "name": "OpenAIWorker",
  // requestId for the 'forward' itself (optional, could use inner ID)
  "requestId": "user-a1b2c3:task-oai1",
  "payload": {
    "target": "MemoryWorker",
    // Inner message (the actual request for MemoryWorker)
    "message": {
      "type": "command",
      "name": "OpenAIWorker", // OpenAIWorker is making the request
      // The NEW chained ID for this specific sub-request
      "requestId": "user-a1b2c3:task-oai1:task-mem1",
      "payload": { "command": "getRelevantMemories", "data": { "query": "..." } }
    }
  }
}
```

**Example Envelope (Response - MemoryWorker to Router, responding to above):**
```json
{
  "type": "response",      // Envelope type
  "name": "MemoryWorker", // Envelope sender
  // MUST include the exact ID from the request it received
  "requestId": "user-a1b2c3:task-oai1:task-mem1",
  "payload": [ { "role": "user", "content": "Relevant memory..." } ] // Example payload (result data)
}
```

## Components

### 1. `router.js` (WorkerRouter)

-   **Role:** Central message broker and controller.
-   **Functionality:**
    -   Manages connections.
    -   Handles worker registration.
    -   Receives envelope messages, logging sender `name` and `requestId`.
    -   Routes messages based on type, target, and `requestId`.
    -   Handles `forward` requests: Maps the *inner message's full `requestId`* to the requesting worker's port, then forwards the inner message to the target.
    -   Handles responses: Uses the full `requestId` from the response to find the original requester's port in its `pendingForwards` map and forwards the response.
    -   Intercepts `/config` commands.
    -   Relays messages to/from the main UI, preserving envelope fields including `name` and `requestId`.

### 2. `base.js` (BaseWorker)

-   **Role:** Abstract base class for workers, enforcing envelope structure and `requestId` handling.
-   **Functionality:**
    -   Provides `onConnect` logic.
    -   Implements `postMessage` (formats communication envelope, adds `name`, includes `requestId`).
    -   Handles `set-config`/`get-config`.
    -   Provides `_generateTaskId()` and `_appendTaskId(baseRequestId)` helpers for managing the chain-based `requestId`.
    -   Defines `handleCustomMessage(messageData)` passing the full envelope object.

### 3. `memory-worker.js` (MemoryWorker)

-   **Role:** Persistent message storage and retrieval.
-   **Extends:** `BaseWorker`.
-   **Functionality:**
    -   Uses `MemoryManager`.
    -   Overrides `handleCustomMessage(messageData)` to process commands based on envelope `type` or `payload.command`. Stores message payloads (which might be OMF chat messages).
    -   Uses the received `messageData.requestId` when sending responses via `this.postMessage` (envelope format).

### 4. `openai.js` (OpenAIWorker)

-   **Role:** Interface to OpenAI-compatible LLM APIs. **Focuses solely on API interaction.**
-   **Extends:** `BaseWorker`.
-   **Functionality:**
    -   Requires `endpoint`, `apiKey`, and `model` configuration (via `set-config`).
    -   Overrides `handleCustomMessage(messageData)` to handle specific request types (e.g., `generate-prompt`).
    -   Expects the incoming payload to contain the fully constructed prompt (likely an OMF Chat Message).
    -   Calls the configured LLM API using `fetch`.
    -   Sends the LLM's response back using `this.postMessage` (envelope format, `type: 'response'`), including the received `requestId`. The payload is an OMF Chat Message.
    -   Sends errors using `this.postMessage` (envelope format, `type: 'error'`).
    -   **Does not** interact directly with other workers (like MemoryWorker).

### 5. `echo.js` (EchoWorker)

-   **Role:** Simple example/test worker.
-   **Extends:** `BaseWorker`.
-   **Functionality:**
    -   Overrides `handleCustomMessage(messageData)` to handle echo requests.
    -   Sends the response using `this.postMessage` (envelope format), including the received `messageData.requestId`.

### 6. `mcp.js` (MCP Worker)

-   **Role:** Basic Model Context Protocol handler.
-   **Extends:** *Does not currently extend BaseWorker*. Needs refactoring for consistent envelope/requestId handling.

## Message Flow Example (User sends message via QnAFlowWorker)

*(Simplified flow showing envelope structure with chained requestId)*

1.  **Main App -> Router:** `{ type: 'user-message', name: 'MainUI', requestId: 'user-a1b2', payload: { role:'user', content:'Hi' } }`.
2.  **Router -> QnAFlowWorker:** Router forwards the original message: `{ type: 'user-message', name: 'MainUI', requestId: 'user-a1b2', payload: { role:'user', content:'Hi' } }`.
3.  **QnAFlowWorker (Step 1 - Add User Msg):**
    *   Generates next ID: `user-a1b2:task-qna1`.
    *   Sends to Router: `{ type: 'forward', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna1', payload: { target: 'MemoryWorker', message: { type: 'command', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna1', payload: { command: 'addMessage', data: { role:'user', content:'Hi' } } } } }`.
4.  **Router -> MemoryWorker:** Forwards inner message: `{ type: 'command', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna1', payload: { command: 'addMessage', ... } }`. (Router maps `user-a1b2:task-qna1` -> QnAFlowWorker port).
5.  **MemoryWorker -> Router:** Sends response: `{ type: 'response', name: 'MemoryWorker', requestId: 'user-a1b2:task-qna1', payload: { status: '...' } }`.
6.  **Router -> QnAFlowWorker:** Router forwards response to QnAFlowWorker.
7.  **QnAFlowWorker (Step 2 - Build Context):**
    *   Generates next ID: `user-a1b2:task-qna2`.
    *   Sends to Router: `{ type: 'forward', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna2', payload: { target: 'MemoryWorker', message: { type: 'buildContext', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna2', payload: { currentMessage: 'Hi' } } } }`.
8.  **Router -> MemoryWorker:** Forwards inner message: `{ type: 'buildContext', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna2', payload: { currentMessage: 'Hi' } }`. (Router maps `user-a1b2:task-qna2` -> QnAFlowWorker port).
9.  **MemoryWorker -> Router:** Sends context response: `{ type: 'response', name: 'MemoryWorker', requestId: 'user-a1b2:task-qna2', payload: { context... } }`.
10. **Router -> QnAFlowWorker:** Router forwards response to QnAFlowWorker.
11. **QnAFlowWorker (Step 3 - Generate Response):**
    *   Constructs full prompt.
    *   Generates next ID: `user-a1b2:task-qna3`.
    *   Sends to Router: `{ type: 'forward', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna3', payload: { target: 'OpenAIWorker', message: { type: 'generate-prompt', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna3', payload: { role: 'user', content: fullPrompt } } } }`.
12. **Router -> OpenAIWorker:** Forwards inner message: `{ type: 'generate-prompt', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna3', payload: { role: 'user', content: fullPrompt } }`. (Router maps `user-a1b2:task-qna3` -> QnAFlowWorker port).
13. **OpenAIWorker (Calls API) -> Router:** Sends LLM response: `{ type: 'response', name: 'OpenAIWorker', requestId: 'user-a1b2:task-qna3', payload: { role: 'assistant', content: 'Hello!' } }`.
14. **Router -> QnAFlowWorker:** Router forwards response to QnAFlowWorker.
15. **QnAFlowWorker (Step 4 - Add Assistant Msg):**
    *   Generates next ID: `user-a1b2:task-qna4`.
    *   Sends to Router: `{ type: 'forward', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna4', payload: { target: 'MemoryWorker', message: { type: 'command', name: 'QnAFlowWorker', requestId: 'user-a1b2:task-qna4', payload: { command: 'addMessage', data: { role: 'assistant', ...} } } } }`.
16. **Router -> MemoryWorker:** Forwards inner message.
17. **MemoryWorker -> Router:** Sends response: `{ type: 'response', name: 'MemoryWorker', requestId: 'user-a1b2:task-qna4', payload: { status: '...' } }`.
18. **Router -> QnAFlowWorker:** Router forwards response.
19. **QnAFlowWorker (Step 5 - Final Response):**
    *   Sends final response to Router: `{ type: 'response', name: 'QnAFlowWorker', requestId: 'user-a1b2', payload: { role: 'assistant', content: 'Hello!' } }`. (Uses original user ID).
20. **Router -> Main App:** Relays final response: `{ type: 'agent-message', name: 'QnAFlowWorker', requestId: 'user-a1b2', payload: { role: 'assistant', content: 'Hello!' } }`. (Note: `name` is now the orchestrator).

## Configuration

-   Managed via envelope messages (`type: 'set-config'` / `type: 'get-config'`).

## Extensibility

1.  Create worker, extend `BaseWorker`.
2.  Implement `handleCustomMessage(messageData)`. Use `messageData.requestId` in responses. Use `this._appendTaskId(messageData.requestId)` for new tracked sub-requests.
3.  Register worker.