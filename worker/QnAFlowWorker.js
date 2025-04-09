// worker/qna-flow-worker.js - Orchestrates the standard Q&A flow
import BaseWorker from './base.js';

class QnAFlowWorker extends BaseWorker {
    constructor() {
        super();
        this.name = "QnAFlowWorker"; // Set worker name
        // Map to store pending request promises, keyed by full chained requestId
        this.pendingRequests = new Map();
        console.log(`${this.name}: Instance created.`);
    }

    // Override BaseWorker's onConnect to ensure port is available early
    onConnect(event) {
        console.log(`${this.name}: onConnect event received.`); // Log entry
        try {
            super.onConnect(event); // Sets up this.port and the main message listener
            console.log(`${this.name}: super.onConnect completed. Port should be set.`);
            // BaseWorker's listener will call our handleCustomMessage
        } catch (error) {
            console.error(`${this.name}: Error during super.onConnect:`, error);
        }
    }


    /**
     * Sends a command to another worker via the router and waits for a response
     * using the pendingRequests map.
     * @param {string} targetWorker - The name of the worker to send the command to.
     * @param {object} innerMessagePayload - The payload for the inner OMF message.
     * @param {string} innerMessageType - The type for the inner OMF message (e.g., 'command', 'request').
     * @param {string} baseRequestId - The current request ID chain (e.g., "user-abc" or "user-abc:task1"). Used as the base for the next ID in the chain.
     * @returns {Promise<object>} A promise that resolves with the payload of the response.
     */
    sendCommandToWorker(targetWorker, innerMessagePayload, innerMessageType = 'command', baseRequestId) {
        return new Promise((resolve, reject) => {
            // Generate the next ID in the chain for this specific sub-request
            // e.g., base="user-abc:task1", next="user-abc:task1:task-oai1"
            const nextRequestId = this._appendTaskId(baseRequestId);
            console.log(`${this.name}: Sending command to ${targetWorker}. BaseReqID: ${baseRequestId}, NextReqID: ${nextRequestId}`);

            // Store promise resolvers keyed by the *newly generated* chained ID.
            // The response from the target worker MUST include this exact ID.
            this.pendingRequests.set(nextRequestId, { resolve, reject });

            // Set a timeout
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(nextRequestId)) {
                    this.pendingRequests.delete(nextRequestId);
                    console.error(`${this.name}: Request ${nextRequestId} to ${targetWorker} timed out.`);
                    reject(new Error(`Request ${nextRequestId} to ${targetWorker} timed out.`));
                }
            }, 30000); // 30-second timeout

            if (!this.port) {
                 clearTimeout(timeoutId);
                 this.pendingRequests.delete(nextRequestId);
                 return reject(new Error("Cannot send command: Worker port is not connected."));
            }

            // Construct the inner OMF message for the target worker
            const innerMessage = {
                type: innerMessageType,
                name: this.name, // This worker is sending the inner request
                payload: innerMessagePayload,
                // The inner message carries the *newly generated* chained ID.
                // This ID links this specific sub-request back to the original user request
                // AND uniquely identifies this sub-request for response routing.
                requestId: nextRequestId
            };

            // Send the 'forward' message to the router.
            // The payload of the 'forward' message contains the target and the actual message to send.
            this.postMessage({
                type: 'forward',
                // The requestId here is the ID for the sub-request being initiated.
                // The router will use this ID (from the inner message) to map the response.
                requestId: nextRequestId,
                payload: {
                     target: targetWorker,  // Specify the destination worker
                     message: innerMessage  // The actual OMF message envelope for the target
                }
            });

             // Modify resolve/reject to clear timeout when the promise settles
             const promiseControls = this.pendingRequests.get(nextRequestId);
             promiseControls.resolve = (value) => {
                 clearTimeout(timeoutId);
                 resolve(value);
             };
             promiseControls.reject = (err) => {
                 clearTimeout(timeoutId);
                 reject(err);
             };
        });
    }


    /**
     * Handles incoming messages. Checks for responses to pending requests first,
     * then handles triggers for the Q&A flow.
     * @param {object} messageData - The full incoming OMF message object, including the current requestId chain.
     */
    async handleCustomMessage(messageData) {
        console.log(`${this.name}: handleCustomMessage called with type: ${messageData?.type}`); // Log entry
        // 'requestId' here is the full chain received (e.g., "user-abc" or "user-abc:task-mem1")
        const { type, name: senderName, payload, requestId } = messageData;

        // --- Check for Responses to Pending Requests ---
        // Check if the received requestId matches a pending request initiated by *this* worker.
        if (requestId && this.pendingRequests.has(requestId)) {
            const { resolve, reject } = this.pendingRequests.get(requestId);
            if (type === 'response' || type === 'result') {
                console.log(`${this.name}: Received response for ReqID ${requestId} from ${senderName}.`);
                resolve(payload); // Resolve the promise
            } else if (type === 'error') {
                console.error(`${this.name}: Received error for ReqID ${requestId} from ${senderName}:`, payload?.error);
                reject(new Error(payload?.error || 'Unknown error from worker response'));
            } else {
                 console.warn(`${this.name}: Received unexpected message type '${type}' for pending ReqID ${requestId} from ${senderName}.`);
                 // Decide if this should reject or be ignored
                 // reject(new Error(`Unexpected message type ${type} for request ${requestId}`));
            }
            this.pendingRequests.delete(requestId); // Clean up map
            return; // Stop further processing for this response
        }

        // --- Handle Triggers for New Flows ---
        // Expecting a trigger message, e.g., type 'user-message' forwarded by the router
        // The 'requestId' here is the base chain (e.g., "user-abc") passed from the UI/Router.
        if (type === 'user-message') {
            const userMessagePayload = payload; // Should be OMF Chat Message { role, content, name? }

            if (!userMessagePayload || userMessagePayload.role !== 'user' || !userMessagePayload.content) {
                console.error(`${this.name}: Received invalid user message payload for flow. ReqID: ${requestId}`);
                // Include received requestId in error response
                this.postMessage({ type: 'error', requestId, payload: { error: 'Invalid user message payload for QnA flow.' } });
                return;
            }

            console.log(`${this.name}: Starting QnA flow for ReqID: ${requestId}`);

            try {
                // --- Step 1: Add user message to memory ---
                console.log(`${this.name}: Step 1 - Add user message. ReqID: ${requestId}`);
                await this.sendCommandToWorker(
                    'memory',
                    { command: 'addMessage', data: userMessagePayload },
                    'command',
                    requestId // Pass the received base request ID chain
                );
                console.log(`${this.name}: Step 1 - User message added. ReqID: ${requestId}`);

                // --- Step 2: Build Context ---
                console.log(`${this.name}: Step 2 - Build context. ReqID: ${requestId}`);
                // Construct the payload directly as expected by MemoryWorker's buildContext case
                const contextInnerPayload = {
                    currentMessage: userMessagePayload.content,
                    // options: {} // Add options if needed later
                };
                // Pass the received base request ID to generate the next step in the chain
                const contextResult = await this.sendCommandToWorker(
                    'memory',           // Target worker
                    contextInnerPayload, // The actual payload for the inner message
                    'buildContext',     // Use specific type or keep 'command' if MemoryWorker handles it
                    requestId           // Pass base requestId
                );
                console.log(`${this.name}: Step 2 - Context received. ReqID: ${requestId}`, contextResult);

                // --- Step 3: Construct Prompt and Generate Response ---
                console.log(`${this.name}: Step 3 - Construct prompt & generate response. ReqID: ${requestId}`);

                // Construct the full prompt string here, combining context and user message
                // This is a simplified example; formatting might be more complex
                let fullPrompt = "";
                if (contextResult?.relevantMemories?.length > 0) {
                    fullPrompt += "Relevant previous messages:\n";
                    contextResult.relevantMemories.forEach(mem => {
                        fullPrompt += `- ${mem.role}: ${mem.content}\n`;
                    });
                    fullPrompt += "\n";
                }
                 if (contextResult?.recentMessages?.length > 0) {
                    fullPrompt += "Recent conversation:\n";
                    contextResult.recentMessages.forEach(msg => {
                        fullPrompt += `- ${msg.role}: ${msg.content}\n`;
                    });
                     fullPrompt += "\n";
                }
                fullPrompt += `Current user message:\n- user: ${userMessagePayload.content}`;

                console.log(`${this.name}: Constructed prompt:`, fullPrompt);

                // Prepare a simple OMF Chat Message payload for OpenAIWorker
                const llmRequestPayload = {
                    role: 'user', // Treat the whole constructed prompt as user input for the LLM
                    content: fullPrompt
                };

                // Send the request to OpenAIWorker using a specific type
                // Pass the received base request ID to generate the next step in the chain
                const assistantResponsePayload = await this.sendCommandToWorker(
                    'openai',           // Target worker
                    llmRequestPayload,  // The OMF Chat Message payload
                    'generate-prompt',  // Specific type for this request
                    requestId           // Pass base requestId
                );
                console.log(`${this.name}: Step 3 - Assistant response received. ReqID: ${requestId}`, assistantResponsePayload);

                 // Validate assistant response payload (should be OMF Chat Message)
                if (!assistantResponsePayload || assistantResponsePayload.role !== 'assistant' || !assistantResponsePayload.content) {
                    throw new Error('Invalid response payload structure from OpenAIWorker.');
                }

                // --- Step 4: Add assistant message to memory ---
                console.log(`${this.name}: Step 4 - Add assistant message. ReqID: ${requestId}`);
                await this.sendCommandToWorker(
                    'memory',
                    { command: 'addMessage', data: assistantResponsePayload },
                    'command',
                    requestId // Pass the received base request ID chain
                );
                console.log(`${this.name}: Step 4 - Assistant message added. ReqID: ${requestId}`);

                // --- Step 5: Send final response back to UI ---
                console.log(`${this.name}: Step 5 - Sending final response to UI. ReqID: ${requestId}`);
                // Use 'response' type, include original requestId chain
                this.postMessage({ type: 'response', requestId, payload: assistantResponsePayload });

                console.log(`${this.name}: QnA flow completed for ReqID: ${requestId}`);

            } catch (error) {
                console.error(`${this.name}: Error during QnA flow (ReqID: ${requestId}):`, error);
                // Send error back to UI
                // Include received requestId in error response
                this.postMessage({ type: 'error', requestId, payload: { error: `QnA Flow failed: ${error.message}` } });
            }

        } else {
            // If not a response and not the trigger message, let BaseWorker handle it
            super.handleCustomMessage(messageData);
        }
    }
}

// Instantiate the worker
const qnaFlowWorker = new QnAFlowWorker();

// Set up the connection listener for the SharedWorker environment
self.onconnect = (event) => {
    qnaFlowWorker.onConnect(event);
};

console.log('QnA Flow Worker (Shared): Script loaded, instance created, waiting for connections.');