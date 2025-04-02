
function handleMessage(messageEvent, port) {
    const { type, payload } = messageEvent.data
    const new_port = messageEvent.ports[0];

    if (type === 'register') {
        console.log('Registering worker:', payload.name);
        payload.port = new_port
        payload.port.start();
        payload.port.addEventListener('message',  (event) => handleMessage(event, port));
        routes.push(payload);
        
        // port.postMessage({ type: 'worker-registered', payload: { name: payload.name } });
    }
    else if (type === 'user-message') {
        console.log('Received user message:', payload);

        // Validate LLM message payload structure
        if (!payload || typeof payload !== 'object' || !payload.role || !payload.content) {
            console.error('Invalid LLM message payload received:', payload);
            port.postMessage({ type: 'error', payload: 'Invalid LLM message payload structure.' });
            return;
        }

        //for each route post the message
        routes.forEach(( route ) => {
            route.port.postMessage({ type: 'user-message', payload });
        });

    } else if (type === 'worker-message') {
        port.postMessage({ type: 'agent-message', payload });
    } else if (type === 'connect') {
        console.warn('already connected')
    } else {
        console.warn('Unknown message type:', type);
    }
}
// Shared Web Worker script
onconnect = async (event) => {
    const port = event.ports[0];
    console.log('Shared Worker connected:', port);
    routes = []

    port.addEventListener('message', (e) => handleMessage(e, port));

    // Handle worker lifecycle events
    port.addEventListener('error', (errorEvent) => {
        console.error('Error in Shared Web Worker:', errorEvent.message);
    });

    port.addEventListener('unhandledrejection', (rejectionEvent) => {
        console.error('Unhandled promise rejection in Shared Web Worker:', rejectionEvent.reason);
    });

    port.start();
}


