class BaseWorker {
    constructor() {
        this.config = {
            user: "Default User",
            role: "Default Role"
        };
    }

    onConnect(event) {
        const port = event.ports[0];

        port.addEventListener('message', (messageEvent) => {
            const { type, payload } = messageEvent.data;

            if (type === 'set-config') {
                Object.assign(this.config, payload);
                port.postMessage({ type: 'config-updated', payload: this.config });
            } else if (type === 'get-config') {
                if (payload.key) payload.content = this.config[payload.key];
                else payload.content = JSON.stringify(this.config, null, 2);
                port.postMessage({ type: 'worker-message', payload });
            } else {
                this.handleCustomMessage(type, payload, port);
            }
        });

        port.start();
    }


    handleCustomMessage(type, payload, port) {
        port.postMessage({ type: 'error', payload: 'Unknown message type.' });
    }
}

export default BaseWorker;