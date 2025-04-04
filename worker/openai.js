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
            const { content } = payload;

            if (!this.config.endpoint || !this.config.apiKey || !this.config.model || !payload) {
                port.postMessage({ type: 'error', payload: 'Missing required parameters for OpenAI API call.' });
                return;
            }
            const requestBody = {
                contents: [
                  {
                    parts: [
                      {
                        text: content
                      }
                    ]
                  }
                ]
              }
            // requestBody.messages.push(payload)
            fetch(`${this.config.endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            })
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`API call failed with status ${response.status}`);
                    }
                    let resp = await response.json();
                    resp = resp.candidates[0].content.parts[0].text; // Extract the text field
                    resp = { role: "agent", content: resp }
                    port.postMessage({ type: 'worker-message', payload: resp });          
                })
                .then((data) => {
                    port.postMessage({ type: 'worker-message', payload: { role: "agent", content: data } });
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