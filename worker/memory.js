// worker/memory-worker.js - Refactored into a class extending BaseWorker
import BaseWorker from './base.js';
import { MemoryManager } from '../memory/memory-manager.js';

class MemoryWorker extends BaseWorker {
    constructor() {
        super();
        this.name = "MemoryWorker"; // Set worker name
        this.memoryManager = null;
        this.initializationPromise = null;
        this.isInitialized = false;
        this.initializationError = null;

        console.log(`${this.name}: Worker instance created.`);
        // Start initialization early
        this._initialize();
    }

    // Override BaseWorker's onConnect
    onConnect(event) {
        console.log(`${this.name}: New connection established.`);
        // Call super.onConnect FIRST to set up this.port and basic listeners (like config)
        super.onConnect(event);

        // Now that this.port is set by super.onConnect, inform the client about status
        this._sendStatus(this.port);
    }

    // Private initialization method
    async _initialize() {
        if (!this.initializationPromise) {
            console.log(`${this.name}: Starting initialization...`);
            this.initializationPromise = (async () => {
                try {
                    this.memoryManager = new MemoryManager({
                        historySize: 50, // Example config
                    });
                    // Potentially wait for internal model loading if needed
                    // await this.memoryManager.waitForModel(); // Example if MemoryManager provided such a method
                    console.log(`${this.name}: MemoryManager initialized successfully.`);
                    this.isInitialized = true;
                    return this.memoryManager;
                } catch (error) {
                    console.error(`${this.name}: Failed to initialize MemoryManager:`, error);
                    this.initializationError = error;
                    this.isInitialized = false; // Ensure state is correct on error
                    throw error; // Re-throw
                }
            })();
        }
        return this.initializationPromise;
    }

    // Send initialization status to a connecting port
    _sendStatus(port) {
         if (this.isInitialized) {
             port.postMessage({ type: 'status', payload: 'ready' });
         } else if (this.initializationError) {
             port.postMessage({ type: 'status', payload: 'error', error: this.initializationError.message });
         } else {
             // If initialization is still in progress, wait and then send status
             this.initializationPromise.then(() => {
                 port.postMessage({ type: 'status', payload: 'ready' });
             }).catch(err => {
                 port.postMessage({ type: 'status', payload: 'error', error: err.message });
             });
         }
    }

    // Override BaseWorker's handleCustomMessage
    // Receives the full OMF message data object
    async handleCustomMessage(messageData) {
        // Destructure OMF fields from the message data
        // 'requestId' contains the full request ID chain (e.g., "user-abc" or "user-abc:task-oai1")
        const { type, name: senderName, payload, requestId } = messageData;

        // Determine the command, potentially embedded in the payload
        // (Adjust based on how the router sends commands, e.g., if type='command')
        const command = type === 'command' ? payload?.command : type;

        console.log(`${this.name}: Received command '${command}' from '${senderName || 'Unknown'}'. ReqID: ${requestId || 'None'}. Payload:`, payload);

        // Ensure initialization is complete
        if (!this.isInitialized) {
            // If initialization failed previously, report error
            if (this.initializationError) {
                 // Use the inherited postMessage method
                 this.postMessage({ type: 'error', requestId, payload: { error: `Memory worker initialization failed: ${this.initializationError.message}` } });
                 return;
            }
            // If still initializing, wait for it
            try {
                await this.initializationPromise;
                 if (!this.isInitialized) { // Check again after await
                    throw new Error("Initialization did not complete successfully.");
                 }
            } catch (error) {
                 this.postMessage({ type: 'error', requestId, payload: { error: `Memory worker initialization failed: ${error.message}` } });
                 return;
            }
        }

        // Double-check memoryManager after initialization attempt
        if (!this.memoryManager) {
             console.error(`${this.name}: MemoryManager is null after initialization attempt.`);
             this.postMessage({ type: 'error', requestId, payload: { error: 'Internal error: MemoryManager not available.' } });
             return;
        }

        // Process memory-specific commands
        try {
            let result;
            switch (command) {
                case 'addMessage':
                    // Assuming payload contains { command: 'addMessage', data: { role: 'user', content: '...' } }
                    const messageToAdd = payload?.data;
                    if (messageToAdd && messageToAdd.role && messageToAdd.content) {
                        result = await this.memoryManager.addMessage(messageToAdd);
                        // For addMessage, the response might just be confirmation
                        result = { status: 'Message added', added: result }; // Example confirmation payload
                    } else {
                        throw new Error('Invalid payload structure for addMessage command.');
                    }
                    break;
                case 'getRecentMessages':
                    // Assuming payload might contain { limit: N }
                    result = this.memoryManager.getRecentMessages(payload?.limit);
                    break;
                case 'getRelevantMemories':
                    // Assuming payload contains { query: '...', limit: N }
                    if (payload && payload.query) {
                        result = await this.memoryManager.getRelevantMemories(payload.query, payload.limit);
                    } else {
                        throw new Error('Invalid payload for getRelevantMemories command.');
                    }
                    break;
                case 'buildContext':
                    // Assuming payload contains { currentMessage: '...', options: {...} }
                    if (payload && payload.currentMessage) {
                         result = await this.memoryManager.buildContext(payload.currentMessage, payload.options);
                    } else {
                        throw new Error('Invalid payload for buildContext command.');
                    }
                    break;
                case 'clearMemory':
                    result = await this.memoryManager.clearMemory();
                    break;
                default:
                    // If the command wasn't handled, maybe let the base class try?
                    // Or just report unknown command here.
                    console.warn(`${this.name}: Unknown command received: ${command}`);
                    this.postMessage({ type: 'error', requestId, payload: { error: `Unknown command: ${command}` } });
                    return; // Exit early for unknown commands
            }

            // Send result back
            // Send result back using the inherited postMessage.
            // Crucially, include the *received requestId* chain to allow the router
            // or original requester to correlate the response.
            this.postMessage({ type: 'response', requestId, payload: result });

        } catch (error) {
            console.error(`${this.name}: Error processing command ${command}:`, error);
            // Send error back using the inherited postMessage.
            // Include the *received requestId* chain for correlation.
            this.postMessage({ type: 'error', requestId, payload: { error: error.message } });
        }
    }
}

// Instantiate the worker
const memoryWorker = new MemoryWorker();

// Set up the connection listener for the SharedWorker environment
self.onconnect = (event) => {
    memoryWorker.onConnect(event);
};

console.log('Memory Worker (Shared): Script loaded, instance created, waiting for connections.');