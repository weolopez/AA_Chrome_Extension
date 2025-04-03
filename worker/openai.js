// SharedWorker for making OpenAI API calls using Azure endpoints
import BaseWorker from './base.js';

class OpenAIWorker extends BaseWorker {
    constructor() {
        super();
        this.config.endpoint = null;
        this.config.apiKey = null;
        this.config.model = null;
    }

    handleCustomMessage(type, payload, port) {
        if (type === 'user-message') {
            const { prompt } = payload;

            if (!this.config.endpoint || !this.config.apiKey || !this.config.model || !payload) {
                port.postMessage({ type: 'error', payload: 'Missing required parameters for OpenAI API call.' });
                return;
            }
            const requestBody = {
                model: this.config.model,
                messages: [
                    { role: "system", content: "You are a helpful assistant." }
                ],
                stream: false
            }
            requestBody.messages.push(payload)
            fetch(`${this.config.endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': `${this.config.apiKey}`,
                    'mode': 'no-cors' // no-cors, *cors, same-origin
                },
                body: JSON.stringify(requestBody)
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`API call failed with status ${response.status}`);
                    }
                    port.postMessage({ type: 'worker-message', payload: response.json() });
                })
                .then((data) => {
                    port.postMessage({ type: 'worker-message', payload: data });
                })
                .catch((error) => {
                    port.postMessage({ type: 'error', payload: `Failed to fetch OpenAI API: ${error.message}` });
                });
        } else {
            super.handleCustomMessage(type, payload, port);
        }
    }
}

const openAIWorker = new OpenAIWorker();
onconnect = (event) => openAIWorker.onConnect(event);