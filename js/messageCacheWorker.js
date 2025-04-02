// SharedWorker for storing messages in IndexedDB using standard LLM message format
self.addEventListener('connect', (event) => {
    const port = event.ports[0];

    // Open or create the IndexedDB database
    const request = indexedDB.open('MessageCacheDB', 1);

    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('message_cache')) {
            db.createObjectStore('message_cache', { keyPath: 'id', autoIncrement: true });
        }
    };

    request.onsuccess = () => {
        const db = request.result;

        port.addEventListener('message', (messageEvent) => {
            const { type, payload } = messageEvent.data;

            if (type === 'store-message') {
                // Validate LLM message payload structure
                if (!payload || typeof payload !== 'object' || !payload.role || !payload.content) {
                    console.error('Invalid LLM message payload received:', payload);
                    port.postMessage({ type: 'error', payload: 'Invalid LLM message payload structure.' });
                    return;
                }

                const transaction = db.transaction('message_cache', 'readwrite');
                const store = transaction.objectStore('message_cache');
                store.add(payload);
                transaction.oncomplete = () => {
                    port.postMessage({ type: 'success', payload: 'Message stored successfully.' });
                };
                transaction.onerror = () => {
                    port.postMessage({ type: 'error', payload: 'Failed to store message.' });
                };
            } else {
                port.postMessage({ type: 'error', payload: 'Unknown message type.' });
            }
        });

        port.start();
    };

    request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
    };
});