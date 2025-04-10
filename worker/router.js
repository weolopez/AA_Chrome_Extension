class WorkerRouter {
    constructor(mainPort) {
        this.routes = []; // Stores { name: 'workerName', port: workerPort }
        this.mainPort = mainPort; // Port connected to the main UI (WorkerRegistry)
    }

    handleMessage(messageEvent) {
        const { type, name, payload, requestId, command, error } = messageEvent.data;

        console.log(`Router: Received message - Type: ${type}, Sender: ${name || 'Unknown'}, RequestID: ${requestId || 'None'}`);
        if (type === 'register') {
            console.log(`Router: Registering worker: ${payload.name} from sender: ${name || 'Unknown'}`);
            payload.port = messageEvent.ports[0]; // Used only during registration
            payload.port.start();
            payload.port.addEventListener('message', (event) => this.handleMessage(event));
            if (!this.routes.find(route => route.name === payload.name)) {
                this.routes.push(payload);
            } else {
                console.warn(`Worker ${payload.name} is already registered.`);
            }
            if (payload.name === 'memory') this.memoryWorker = payload;
            else if (payload.name === 'openai') this.openAIWorker = payload;
        } else if (type === 'user-message') {
            console.log(`Router: Received user message from ${name || 'Unknown'}:`, payload);

            if (payload.content.startsWith('/config')) {
                const [ , workerName, action, key, value] = payload.content.split(' ');
                const targetWorkerRoute = this.routes.find((route) => route.name === workerName);
                targetWorkerRoute.port.postMessage({ type: `${action}-config`, name: 'Router', payload: {[key]: value }, requestId });
            } else {
                this.openAIWorker.port.postMessage({ type: 'user-message', name, payload: payload, requestId });
                this.memoryWorker.port.postMessage({ type: 'remember', name, payload: payload, requestId });
            }
        } else if (type === 'response' || type === 'result' || type === 'error' || type === 'status') {
             console.log(`Router: Relaying '${type}' message from '${name || 'Unknown'}' (requestId: ${requestId || 'none'}) to main UI.`);
             this.mainPort.postMessage({ type: 'agent-message', name, payload: payload, requestId: requestId });
             this.memoryWorker.port.postMessage({ type: 'remember', name, payload: payload, requestId });
        } else if (type === 'connect') { // Should not happen via message listener
            console.warn('Router: Received unexpected "connect" message via listener.');
        } else {
            console.warn(`Router: Unknown message type '${type}' received from '${name || 'Unknown'}'. Data:`, messageData);
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
