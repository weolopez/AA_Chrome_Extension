class WorkerRouter {
    constructor(mainPort) {
        this.routes = [];
        this.mainPort = mainPort;
        // this.mainPort.addEventListener('message', (event) => this.handleMessage(event));
    }

    handleMessage(messageEvent) {
        const { type, payload } = messageEvent.data;
        const newPort = messageEvent.ports[0];

        if (type === 'register') {
            console.log('Registering worker:', payload.name);
            payload.port = newPort;
            payload.port.start();
            payload.port.addEventListener('message', (event) => this.handleMessage(event));
            if (!this.routes.find(route => route.name === payload.name)) {
                this.routes.push(payload);
            } else {
                console.warn(`Worker ${payload.name} is already registered.`);
            }
        } else if (type === 'user-message') {
            console.log('Received user message:', payload);

            if (payload.content.startsWith('/config')) {
                const [ , workerName, action, key, value] = payload.content.split(' ');
                const targetWorker = this.routes.find((route) => route.name === workerName);
                if (!targetWorker) {
                    this.mainPort.postMessage({ type: 'error', payload: `Worker ${workerName} not found.` });
                    return;
                }

                if (action === 'get') {
                    targetWorker.port.postMessage({ type: 'get-config', payload: { key } });
                } else if (action === 'set') {
                    const cacheWorker = this.routes.find((route) => route.name === "cache");
                    targetWorker.port.postMessage({ type: 'set-config', payload: {[key]: value } });
                    cacheWorker.port.postMessage({ type: 'save-config', name:workerName ,payload: {[key]: value } });
                } else {
                    this.mainPort.postMessage({ type: 'error', payload: `Invalid action ${action}. Use 'get' or 'set'.` });
                }
            } else {
                if (!payload || typeof payload !== 'object' || !payload.role || !payload.content) {
                    console.error('Invalid LLM message payload received:', payload);
                    this.mainPort.postMessage({ type: 'error', payload: 'Invalid LLM message payload structure.' });
                    return;
                }

                this.routes.forEach((route) => {
                    route.port.postMessage({ type: 'user-message', payload });
                });
            }
        } else if (type === 'worker-message') {
            this.mainPort.postMessage({ type: 'agent-message', payload });
        } else if (type === 'connect') {
            console.warn('already connected');
        } else {
            console.warn('Unknown message type:', type);
        }
    }
}

self.onconnect = (event) => {
    const port = event.ports[0];
    let router = new WorkerRouter(port);
    console.log('Shared Worker connected:', port);
    let routes = [];

    port.addEventListener('message', (e) => router.handleMessage(e, port, routes));

    // Handle worker lifecycle events
    port.addEventListener('error', (errorEvent) => {
        console.error('Error in Shared Web Worker:', errorEvent.message);
    });

    port.addEventListener('unhandledrejection', (rejectionEvent) => {
        console.error('Unhandled promise rejection in Shared Web Worker:', rejectionEvent.reason);
    });

    port.start();
}


