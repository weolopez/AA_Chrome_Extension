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
            // Define the list of essential workers, including the new flow orchestrator
            const essentialWorkers = [ 'echo', 'openai', 'memory', 'QnAFlowWorker'];
            const missingWorkers = essentialWorkers.filter(workerName => !workers.some(w => w.name === workerName));
            missingWorkers.forEach(worker => workers.push({ name: worker }));
            workers.forEach(worker => {
                if (worker.name !== 'router') {
                    this.addWorker(worker.name, worker.config);
                }
            });
        });
    } 

    initWorker(workerName) {
        try {
            const workerUrl = new URL(`../worker/${workerName}.js`, import.meta.url);
            console.log(`WorkerRegistry: Initializing SharedWorker for ${workerName} at ${workerUrl.href}`);

            const worker = new SharedWorker(workerUrl, { name: workerName, type: 'module' });

            // *** Add error handler directly to the worker object ***
            // This catches errors during script fetching, parsing, or initial execution.
            worker.onerror = (event) => {
                console.error(`WorkerRegistry: Error loading SharedWorker '${workerName}'.`, event);
                // Log the specific error if available (might be limited)
                if (event instanceof ErrorEvent) {
                    console.error(`   Message: ${event.message}`);
                    console.error(`   Filename: ${event.filename}`);
                    console.error(`   Lineno: ${event.lineno}`);
                    // Note: Detailed error might not always be available due to security/CORS.
                }
                // You could potentially dispatch an event to the UI here to indicate failure.
                // document.dispatchEvent(new CustomEvent('worker-error', { detail: { name: workerName, error: event } }));
            };

            // Start the port communication channel
            worker.port.start();

            console.log(`WorkerRegistry: Port started for ${workerName}.`);
            return worker.port; // Return the port for communication
        } catch (error) {
            console.error(`Failed to initialize worker "${workerName}":`, error);
            throw new Error(`Worker "${workerName}" could not be started. Ensure the file exists and is valid.`);
        }
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
        if (config) {
            port.postMessage({ type: 'set-config', payload: config });
        }
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
    async getConfig() {
        //gets the whole configuration table and return it as a json object
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async saveConfig() {
        try {
            // Retrieve the full configuration using WorkerRegistry
            const configData = await this.getConfig();
            const json = JSON.stringify(configData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'db_export.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log(`${this.dbName}: Configuration saved.`);
        } catch (err) {
            console.error(`${this.dbName}: Error saving configuration:`, err);
        }
    }
    async restoreConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const jsonData = JSON.parse(e.target.result);
                        const db = await this.initDB();
                        const transaction = db.transaction(this.storeName, 'readwrite');
                        const store = transaction.objectStore(this.storeName);
                        // Clear existing configuration
                        store.clear();
                        // Restore each configuration record
                        jsonData.forEach(record => {
                            store.put(record);
                        });
                        transaction.oncomplete = () => {
                            console.log(`${this.dbName}: Configuration restored.`);
                        };
                        transaction.onerror = (err) => {
                            console.error(`${this.dbName}: Error restoring configuration:`, err);
                        };
                    } catch (err) {
                        console.error(`${this.dbName}: Error processing file:`, err);
                    }
                };
                reader.readAsText(file);
            }
        });

        // Trigger the file upload dialog
        input.click();
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
        if (!message || typeof message !== 'object' || !message.payload.content) {
            console.error('Invalid message. Please provide a valid LLM message payload.');
            return;
        }

        // Add default name if not provided
        if (!message.name) {
            message.name = 'user';
        }

        this.router.postMessage(message);
    }
}

// Initialize and connect to other Shared Workers
// let workerPorts = messageWorkers.map(({ uri, name }) => {
//     const worker = new SharedWorker(uri, { name });
//     this.router.start();
//     return this.router;
// });
// console.log('Message Workers:', messageWorkers);



