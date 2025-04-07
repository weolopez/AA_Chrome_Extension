/**
 * Base class for Shared Workers in this project, implementing basic connection
 * handling, configuration management, and message posting using the
 * Open Message Format (OMF).
 *
 * Open Message Format (OMF) Fields:
 * - type: (String) The type of the message (e.g., 'request', 'response', 'error', 'status', 'config').
 * - name: (String) The name of the sender (worker name). Added automatically by postMessage.
 * - requestId: (String, Optional) A chain-based identifier for end-to-end tracing and request/response matching.
 *   - Format: `<user_request_id>[:<task_id_1>[:<task_id_2>...]]`
 *   - Generated initially by the UI, appended by workers initiating sub-tasks.
 * - payload: (Object) The actual data being sent.
 */

import { WorkerRegistry } from '../js/workerRegistry.js';
class BaseWorker {
    constructor() {
        // Worker name should be overridden by subclasses
        this.name = "BaseWorker";
        this.port = null; // The communication port to the client/router
        this.config = {
            name: "BaseWorker",
            user: "defaultUser",
            role: "defaultRole",
            content: "defaultContent",
        };
        console.log(`${this.name}: Instance created.`);
    }

    /**
     * Sends a message through the worker's port, formatted according to OMF.
     * Automatically adds the worker's name to the message.
     * @param {object} params - Message parameters.
     * @param {string} params.type - The OMF message type.
     * @param {object} params.payload - The OMF message payload.
     * @param {string} [params.requestId] - Optional OMF request ID (chain-based). Should be included in responses or when initiating new tasks in a chain.
     */
    postMessage({ type, payload, requestId }) {
        if (!this.port) {
            console.error(`${this.name}: No port available to send message.`);
            return;
        }
        if (!type || !payload) {
             console.error(`${this.name}: postMessage requires 'type' and 'payload'.`);
             return;
        }

        const message = {
            type: type,
            name: this.name, // Automatically add sender name (OMF standard)
            payload: payload,
        };
        // Include the full requestId chain if provided
        if (requestId) {
            message.requestId = requestId;
        }

        try {
             this.port.postMessage(message);
        } catch (error) {
             console.error(`${this.name}: Error posting message:`, error, message);
             // Attempt to send an error message back if possible
             try {
                 this.port.postMessage({
                     type: 'error',
                     name: this.name,
                     payload: { error: `Failed to serialize message payload for type '${type}'.`, details: error.message },
                     requestId: requestId
                 });
             } catch (nestedError) {
                 console.error(`${this.name}: Failed to send serialization error message.`, nestedError);
             }
        }
    }

    // --- Request ID Helper Methods ---

    /**
     * Generates a short unique task identifier component for the requestId chain.
     * @private
     * @returns {string} A task ID string (e.g., "task-a3b8").
     */
    _generateTaskId() {
        // Simple random hex string for brevity
        return `task-${Math.random().toString(16).slice(2, 8)}`;
    }

    /**
     * Appends a new unique task ID to an existing request ID chain.
     * Used when a worker needs to initiate a new sub-request (e.g., via router's 'forward')
     * that requires its own response tracking, while maintaining the link to the original user request.
     * @protected
     * @param {string} baseRequestId - The current request ID chain received by the worker (e.g., "user-abc" or "user-abc:task-1").
     * @returns {string} The new, extended request ID chain (e.g., "user-abc:task-2" or "user-abc:task-1:task-3"). Returns a new task ID if base is missing.
     */
    _appendTaskId(baseRequestId) {
        const newTaskId = this._generateTaskId();
        if (!baseRequestId) {
            // This might happen if the initial message lacked an ID. Log and start fresh.
            console.warn(`${this.name}: _appendTaskId called without baseRequestId. Starting new chain with ${newTaskId}.`);
            return newTaskId;
        }
        // Append the new task ID to the existing chain
        return `${baseRequestId}:${newTaskId}`;
    }

    // --- Connection and Message Handling ---

    /**
     * Handles the 'connect' event when a client connects to the SharedWorker.
     * Sets up the port and adds the main message listener.
     * @param {MessageEvent} event - The connection event.
     */
    onConnect(event) {
        this.port = event.ports[0];
        console.log(`${this.name}: Connection established.`);

        // *** This is the message listener we suspect contains the error ***
        this.port.addEventListener('message', (messageEvent) => {
            const messageData = messageEvent.data;

            // Basic validation for OMF structure
            if (!messageData || typeof messageData !== 'object' || !messageData.type) {
                console.error(`${this.name}: Received invalid message structure:`, messageData);
                // Use try-catch for postMessage just in case port is invalid during error
                try {
                    this.postMessage({
                        type: 'error',
                        payload: { error: 'Invalid message structure received.' },
                        requestId: messageData?.requestId // Include requestId if available
                    });
                } catch (e) { console.error("Error posting validation error", e); }
                return;
            }

            // Destructure OMF fields. 'requestId' contains the full current chain.
            const { type, name: senderName, payload, requestId } = messageData;

            console.log(`${this.name}: Received message - Type: ${type}, Sender: ${senderName || 'Unknown'}, RequestID: ${requestId || 'None'}`);

            // Handle built-in configuration message types
            if (type === 'set-config') {
                if (payload && typeof payload === 'object') {
                    Object.assign(this.config, payload);
                    console.log(`${this.name}: Config updated:`, this.config);
                    // Respond with confirmation, passing back the original requestId
                    const wr = new WorkerRegistry()
                    wr.updateWorkerConfig(this.name, payload);
                    this.postMessage({ type: 'response', payload: { status: 'config-updated', config: this.config }, requestId });
                } else {
                     this.postMessage({ type: 'error', payload: { error: 'Invalid payload for set-config.' }, requestId });
                }
            } else if (type === 'get-config') {
                const responsePayload = {};
                if (payload?.key) { // Get specific key
                    responsePayload.key = payload.key;
                    responsePayload.value = this.config[payload.key];
                } else { // Get all config
                    responsePayload.config = { ...this.config }; // Send a copy
                }
                // Respond with config data, passing back the original requestId
                this.postMessage({ type: 'response', payload: responsePayload, requestId });
            } else {
                // For all other message types, pass the full OMF message data
                // to the subclass's custom handler.
                // Wrap in try-catch in case handleCustomMessage throws synchronously
                try {
                    this.handleCustomMessage(messageData); // Pass the full data object
                } catch(err) {
                     console.error(`${this.name}: Error executing handleCustomMessage for type ${type}:`, err);
                     // Attempt to send error back
                     try {
                         this.postMessage({ type: 'error', payload: { error: `Error handling message type ${type}: ${err.message}` }, requestId });
                     } catch (e) { console.error("Error posting handleCustomMessage error", e); }
                }
            }
        });

        // Start the port to allow message flow
        this.port.start();
        console.log(`${this.name}: Port started, message listener added.`);
    }

    /**
     * Placeholder for handling custom message types specific to the derived worker.
     * Subclasses should override this method.
     * @param {object} messageData - The full incoming OMF message object, including
     *                             type, name (sender), payload, and the full requestId chain.
     */
    handleCustomMessage(messageData) {
        // Destructure OMF fields including the full requestId chain
        const { type, name: senderName, payload, requestId } = messageData;

        console.warn(`${this.name}: Unhandled message type '${type}' received from '${senderName || 'Unknown'}'. Payload:`, payload);

        // Use the OMF-compliant postMessage to send an error back to the sender via the established port
        this.postMessage({
            type: 'error',
            payload: { error: `Worker ${this.name} cannot handle message type: ${type}` },
            requestId: requestId // Include original requestId chain for correlation
        });
    }
}

export default BaseWorker;
console.log("BaseWorker (Full): Script parsed, class defined, exporting...");