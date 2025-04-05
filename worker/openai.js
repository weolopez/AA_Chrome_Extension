// SharedWorker for making OpenAI API calls using Azure endpoints
import BaseWorker from './base.js';

class OpenAIWorker extends BaseWorker {
    constructor() {
        super();
        this.config.endpoint = "";
        this.config.apiKey = "";
        this.config.model = "";
    }

    handleCustomMessage(type, payload, port) {
        if (type === 'user-message') {
            const { content } = payload;

            if (!this.config.endpoint || !payload) {
                port.postMessage({ type: 'error', payload: 'Missing required parameters for OpenAI API call.' });
                return;
            }
            const requestBody = {
                model: this.config.model || "gemini",
                stream: false,
                messages: [
                    {
                        role: "user",
                        content: content
                    }
                ]
            };

            fetch(`${this.config.endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'authorization': `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify(requestBody)
            })
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`API call failed with status ${response.status}`);
                    }
                    let resp = await response.json();
                    resp = resp.choices[0].message.content; // Extract the content field from the first choice
                    resp = { role: "gemini", content: resp }
                    port.postMessage({ type: 'worker-message', payload: resp });          
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