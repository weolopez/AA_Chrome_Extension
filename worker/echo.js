// SharedWorker that echoes messages back with a prefix
self.addEventListener('connect', (event) => {
    const port = event.ports[0];

    respond = (messageEvent, callback) => {
        const { type, payload } = messageEvent.data;

        if (type === 'user-message') {
            console.log('Received user message:', payload);
            // Validate LLM message payload structure
            if (!payload || typeof payload !== 'object' || !payload.role || !payload.content) {
                console.error('Invalid LLM message payload received:', payload);
            }
        }
        callback(payload)
    }


    port.addEventListener('message', (messageEvent) => {
        respond(messageEvent, (payload) => {
            payload.content = `Echo, ${payload.content}`
            payload.user = "Echo Agent"
            payload.role = "agent"
            port.postMessage({ type: 'worker-message', payload  });
        });
    });

    port.start();
});