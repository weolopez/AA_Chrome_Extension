// SharedWorker for storing messages in IndexedDB using standard LLM message format
import BaseWorker from './base.js';
import { WorkerRegistry } from '../js/workerRegistry.js';

class CacheWorker extends BaseWorker {
    constructor() {
        super();
        this.config.dbName = 'MessageCacheDB';
        this.config.storeName = 'message_cache';
        this.WorkerRegistry = new WorkerRegistry();
    }

    onConnect(event) {
        const port = event.ports[0];

        const request = indexedDB.open(this.config.dbName, 1);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(this.config.storeName)) {
                db.createObjectStore(this.config.storeName, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = () => {
            const db = request.result;

            port.addEventListener('message', (messageEvent) => {
                const { type, name, payload } = messageEvent.data;

                if (type === 'store-message' || type === 'user-message' || type === 'worker-message') {
                    if (!payload || typeof payload !== 'object' || !payload.role || !payload.content) {
                        console.error('Invalid LLM message payload received:', payload);
                        port.postMessage({ type: 'error', payload: 'Invalid LLM message payload structure.' });
                        return;
                    }

                    const transaction = db.transaction(this.config.storeName, 'readwrite');
                    const store = transaction.objectStore(this.config.storeName);
                    store.add(payload);
                    transaction.oncomplete = () => {
                        port.postMessage({ type: 'success', payload: 'Message stored successfully.' });
                    };
                    transaction.onerror = () => {
                        port.postMessage({ type: 'error', payload: 'Failed to store message.' });
                    };
                } else if (type === 'save-config') {
                    this.WorkerRegistry.updateWorkerConfig(name, payload);
                    port.postMessage({ type: 'success', payload: 'Worker configuration saved successfully.' });
                } else {
                    super.handleCustomMessage(type, payload, port);
                }
            });

            port.start();
        };

        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
        };
    }
}

const cacheWorker = new CacheWorker();
onconnect = (event) => cacheWorker.onConnect(event);