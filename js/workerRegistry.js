export class WorkerRegistry {
    constructor() {
        this.dbName = 'WorkerRegistryDB';
        this.storeName = 'worker_registry';
    }

    initRouter() {
        this.router = this.initWorker('router');
        // Event listener for messages from the worker
        this.router.addEventListener('message', (event) => {
            const agentMessageEvent = new CustomEvent('agent-message', {
                detail: event.data
            });
            document.dispatchEvent(agentMessageEvent);
        });

        this.getAllWorkers().then((workers) => {
            //if echo,cache and openai are missing add them
            const missingWorkers = ['echo', 'cache', 'openai'].filter(worker => !workers.some(w => w.name === worker));
            missingWorkers.forEach(worker => workers.push({ name: worker }));
            workers.forEach(worker => {
                if (worker.name !== 'router') {
                    this.addWorker(worker.name, worker.config);
                }
            });
        });
    }

    initWorker(workerName) {        
        const workerUrl = new URL(`../worker/${workerName}.js`, import.meta.url);
        const worker = new SharedWorker(workerUrl, { name: workerName, type: 'module' });
        worker.port.start();
        return worker.port;
    }

    // Initialize IndexedDB
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('name', 'name', { unique: true });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }



    // Add a new worker to the registry
    async addWorker(worker, config) {
        const db = await this.initDB();
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        store.put({ name: worker });

        const port = this.initWorker(worker);
        port.postMessage({ type: 'set-config', payload: config });
        const payload = {
            name: worker
        };
        this.router.postMessage({ type: 'register', payload }, [port]);
    }

    // Update a worker's configuration in the registry
    async updateWorkerConfig(workerName, config) {
        const db = await this.initDB();
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);

        const request = store.index('name').get(workerName);
        request.onsuccess = () => {
            const workerRecord = request.result || { name: workerName };
            workerRecord.config = { ...workerRecord.config, ...config };
            store.put(workerRecord);
        };
        request.onerror = () => {
            console.error(`Failed to update config for worker ${workerName}:`, request.error);
        };
    }

    // Retrieve all workers from the registry
    async getAllWorkers() {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Function to send user messages to the worker
    sendUserMessage(message) {
        if (!message || typeof message !== 'object' || !message.content) {
            console.error('Invalid message. Please provide a valid LLM message payload.');
            return;
        }

        // Add default name if not provided
        if (!message.name) {
            message.name = 'user';
        }

        this.router.postMessage({ type: 'user-message', payload: message });
    }
}

// Initialize and connect to other Shared Workers
// let workerPorts = messageWorkers.map(({ uri, name }) => {
//     const worker = new SharedWorker(uri, { name });
//     this.router.start();
//     return this.router;
// });
// console.log('Message Workers:', messageWorkers);



