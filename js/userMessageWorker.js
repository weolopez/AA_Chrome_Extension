import { getAllWorkers } from './workerRegistry.js';

// Shared Web Worker script
self.addEventListener('connect', async (event) => {
    const [port] = event.ports;
    console.log('Shared Worker connected:', port);

    let messageWorkers = await getAllWorkers()
    console.log('Message Workers:', messageWorkers);

    port.addEventListener('message', (messageEvent) => {
        const { type, payload } = messageEvent.data;

        if (type === 'user-message') {
            console.log('Received user message:', payload);

            // Validate LLM message payload structure
            if (!payload || typeof payload !== 'object' || !payload.role || !payload.content) {
                console.error('Invalid LLM message payload received:', payload);
                port.postMessage({ type: 'error', payload: 'Invalid LLM message payload structure.' });
                return;
            }

            // Echo back a response
            const response = {
                role: 'agent',
                content: `You said, "${payload.content}"`
            };
            port.postMessage({ type: 'agent-message', payload: response });
            
        } else {
            console.warn('Unknown message type:', type);
        }
    });

    port.start();
});

// Handle worker lifecycle events
self.addEventListener('error', (errorEvent) => {
    console.error('Error in Shared Web Worker:', errorEvent.message);
});

self.addEventListener('unhandledrejection', (rejectionEvent) => {
    console.error('Unhandled promise rejection in Shared Web Worker:', rejectionEvent.reason);
});


    // // Initialize and connect to other Shared Workers
    // workerPorts = messageWorkers.map(({ uri, name }) => {
    //     const worker = new SharedWorker(uri, { name });
    //     worker.port.start();
    //     return worker.port;
    // });