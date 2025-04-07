class WorkerRouter {
    constructor(mainPort) {
        this.routes = []; // Stores { name: 'workerName', port: workerPort }
        this.mainPort = mainPort; // Port connected to the main UI (WorkerRegistry)
        // Stores { full_chained_requestId: sourcePort } for forwarded messages awaiting response.
        this.pendingForwards = new Map();
    }

    handleMessage(messageEvent) {
        const messageData = messageEvent.data;
        // Destructure OMF fields. 'target' is no longer expected at the top level for 'forward' messages.
        const { type, name: senderName, payload, requestId, command, error } = messageData;
        const sourcePort = messageEvent.target; // The port the message came FROM
        const newPort = messageEvent.ports[0]; // Used only during registration

        console.log(`Router: Received message - Type: ${type}, Sender: ${senderName || 'Unknown'}, RequestID: ${requestId || 'None'}`);

        if (type === 'register') {
            console.log(`Router: Registering worker: ${payload.name} from sender: ${senderName || 'Unknown'}`);
            payload.port = newPort;
            payload.port.start();
            payload.port.addEventListener('message', (event) => this.handleMessage(event));
            if (!this.routes.find(route => route.name === payload.name)) {
                this.routes.push(payload);
            } else {
                console.warn(`Worker ${payload.name} is already registered.`);
            }
        } else if (type === 'user-message') {
            console.log(`Router: Received user message from ${senderName || 'Unknown'}:`, payload);

            if (payload.content.startsWith('/config')) {
                const [ , workerName, action, key, value] = payload.content.split(' ');
                const targetWorkerRoute = this.routes.find((route) => route.name === workerName);
                if (!targetWorkerRoute) {
                    this.mainPort.postMessage({ type: 'error', name: 'Router', payload: { error: `Worker ${workerName} not found for config.` } });
                    return;
                }
                if (action === 'get') {
                    // Pass requestId for potential response correlation if needed by config handler
                    targetWorkerRoute.port.postMessage({ type: 'get-config', name: 'Router', payload: { key }, requestId });
                } else if (action === 'set') {
                    const cacheWorker = this.routes.find((route) => route.name === "cache");
                    // Pass requestId for potential response correlation
                    targetWorkerRoute.port.postMessage({ type: 'set-config', name: 'Router', payload: {[key]: value }, requestId });
                    if (cacheWorker) {
                        // Pass requestId for potential response correlation
                        cacheWorker.port.postMessage({ type: 'save-config', name: 'Router', payload: { workerName: workerName, config: {[key]: value} }, requestId });
                    } else {
                         console.warn("Router: Cache worker not found, cannot save config.");
                    }
                } else {
                    this.mainPort.postMessage({ type: 'error', name: 'Router', payload: { error: `Invalid config action ${action}. Use 'get' or 'set'.` }, requestId });
                }
            } else {
                if (!payload || typeof payload !== 'object' || !payload.role || !payload.content) {
                    console.error(`Router: Invalid user message payload received from ${senderName || 'Unknown'}:`, payload);
                    this.mainPort.postMessage({ type: 'error', name: 'Router', requestId, payload: { error: 'Invalid user message payload structure.' } });
                    return;
                }
                const qnaFlowWorkerRoute = this.routes.find(route => route.name === 'QnAFlowWorker');
                if (qnaFlowWorkerRoute && qnaFlowWorkerRoute.port) {
                    console.log(`Router: Routing user message from ${senderName || 'Unknown'} to QnAFlowWorker. ReqID: ${requestId}`);
                    qnaFlowWorkerRoute.port.postMessage(messageData);
                } else {
                    console.error(`Router: QnAFlowWorker not found. Cannot process user message. ReqID: ${requestId}`);
                    this.mainPort.postMessage({ type: 'error', name: 'Router', requestId, payload: { error: 'QnA Flow Worker is not available.' } });
                }
            }
        } else if (type === 'forward') {
            // --- Handle Forwarding Request ---
            // 'senderName': The worker initiating the forward (e.g., QnAFlowWorker).
            // 'payload': Should contain { target: 'DestinationWorkerName', message: { /* inner OMF message */ } }.
            // 'requestId': The ID for the sub-request being initiated (should match inner message's requestId).

            // Extract target and inner message from the payload
            const forwardTarget = payload?.target;
            const innerMessage = payload?.message;

            // *** Debug Logging Before Validation ***
            console.log(`Router[Debug Forward]: Received 'forward' from ${senderName}.`);
            console.log(`Router[Debug Forward]: Extracted Target:`, forwardTarget);
            console.log(`Router[Debug Forward]: Extracted Inner Message:`, innerMessage);
            console.log(`Router[Debug Forward]: typeof innerMessage:`, typeof innerMessage);
            console.log(`Router[Debug Forward]: innerMessage?.type:`, innerMessage?.type);
            console.log(`Router[Debug Forward]: innerMessage?.requestId:`, innerMessage?.requestId);
            // *** End Debug Logging ***

            // Validate the extracted target and inner message structure
            // Also check if the outer requestId matches the inner one for consistency
            if (!forwardTarget || !innerMessage || typeof innerMessage !== 'object' || !innerMessage.type || !innerMessage.requestId || innerMessage.requestId !== requestId) {
                 console.error(`Router: Invalid 'forward' message payload structure from ${senderName || 'Unknown'}. Missing target/message, inner message invalid, or requestIds don't match.`, messageData);
                 // Use the requestId from the outer 'forward' message for the error response back to sender
                 sourcePort.postMessage({ type: 'error', name: 'Router', requestId: requestId, payload: { error: "Invalid 'forward' message payload structure, missing inner requestId, or outer/inner requestIds mismatch." } });
                 return;
            }

            // The requestId relevant for mapping is the one *inside* the inner message (which matches the outer one)
            const innerRequestId = innerMessage.requestId;
            const targetWorker = this.routes.find(route => route.name === forwardTarget);

            if (targetWorker && targetWorker.port) {
                console.log(`Router: Forwarding message from '${senderName || 'Unknown'}' to '${forwardTarget}'. Inner Type: ${innerMessage.type}, Inner ReqID: ${innerRequestId}`);

                // Map the inner request ID to the port of the worker requesting the forward
                this.pendingForwards.set(innerRequestId, sourcePort);

                // Forward the inner OMF message (extracted from the payload) to the target worker
                targetWorker.port.postMessage(innerMessage);
            } else {
                console.error(`Router: Target worker '${forwardTarget}' not found for forwarding request from '${senderName || 'Unknown'}'.`);
                // Send error back to the source worker using the inner requestId for correlation
                sourcePort.postMessage({ type: 'error', name: 'Router', requestId: innerRequestId, payload: { error: `Target worker '${forwardTarget}' not found for forwarding.` } });
            }
        } else if (requestId && this.pendingForwards.has(requestId)) {
             // --- Handle Response to a Forwarded Request ---
             const originalRequesterPort = this.pendingForwards.get(requestId);
             if (!originalRequesterPort) {
                 console.error(`Router: No pending forward found for requestId ${requestId} from sender ${senderName || 'Unknown'}. Discarding response.`, messageData);
                 return;
             }
             console.log(`Router: Routing response from '${senderName || 'Unknown'}' for requestId ${requestId} back to original requester port.`);
             originalRequesterPort.postMessage(messageData);
             this.pendingForwards.delete(requestId);
        } else if (type === 'worker-message') { // Potentially deprecated type
             console.log(`Router: Relaying message from '${senderName || 'Unknown'}' to main UI (re-typing as 'agent-message').`);
             this.mainPort.postMessage({ type: 'agent-message', name: senderName, payload: payload, requestId: requestId });
        } else if (type === 'response' || type === 'result' || type === 'error' || type === 'status') {
             // --- Handle other messages likely intended for the Main UI ---
             console.log(`Router: Relaying '${type}' message from '${senderName || 'Unknown'}' (requestId: ${requestId || 'none'}) to main UI.`);
             this.mainPort.postMessage({ type: 'agent-message', name: senderName, payload: payload, requestId: requestId });
        } else if (type === 'connect') { // Should not happen via message listener
            console.warn('Router: Received unexpected "connect" message via listener.');
        } else {
            console.warn(`Router: Unknown message type '${type}' received from '${senderName || 'Unknown'}'. Data:`, messageData);
        }
    }
} // End of WorkerRouter class

// --- Top-level script execution for the SharedWorker ---
self.onconnect = (event) => {
    const port = event.ports[0];
    let router = new WorkerRouter(port);
    console.log('Router Shared Worker: New connection established.');

    port.addEventListener('message', (e) => router.handleMessage(e));
    port.addEventListener('error', (errorEvent) => {
        console.error('Router Shared Worker: Error on port connection:', errorEvent);
    });
    port.start();
};

self.onerror = (event) => {
    console.error('Router Shared Worker: Uncaught error in global scope:', event);
};
self.onunhandledrejection = (event) => {
    console.error('Router Shared Worker: Unhandled promise rejection in global scope:', event.reason);
};

console.log("Router Shared Worker: Script loaded, onconnect handler set.");
