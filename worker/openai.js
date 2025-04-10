// SharedWorker for making OpenAI API calls using Azure endpoints or standard OpenAI
import BaseWorker from './base.js';

class OpenAIWorker extends BaseWorker {
    constructor() {
        super();
        this.name = "openai"; // Set worker name
        this.config.endpoint = ""; // e.g., "https://api.openai.com/v1/chat/completions" or Azure endpoint
        this.config.apiKey = "";
        this.config.model = ""; // e.g., "gpt-4" or your Azure deployment name
        // contextOptions removed, as context building is handled by the orchestrator
        console.log(`${this.name}: Instance created.`);
    }

    // NOTE: sendCommandToWorker, pendingRequests, tempMemoryFormatter removed.
    // NOTE: BaseWorker.onConnect handles the listener setup.

    /**
     * Handles custom messages, specifically processing 'generate-prompt' types
     * to interact with the configured OpenAI API.
     * @param {object} messageData - The full incoming OMF message object.
     */
    async handleCustomMessage(messageData) {
        // 'requestId' is the full chain received (e.g., "user-abc:task-qna1:task-oai1")
        const { type, name: senderName, payload, requestId } = messageData;

        // This worker now only handles 'generate-prompt' requests directly
        if (type === 'generate-prompt') {
            // The payload should be an OMF Chat Message { role: 'user', content: 'full prompt' }
            const promptMessage = payload;

            console.log(`${this.name}: Received '${type}' from '${senderName || 'Unknown'}'. ReqID: ${requestId || 'None'}`);

            // Validate configuration
            if (!this.config.endpoint || !this.config.apiKey || !this.config.model) {
                this.postMessage({ type: 'error', requestId, payload: { error: 'OpenAI Worker not configured. Please set endpoint, apiKey, and model.' } });
                return;
            }
            // Validate incoming payload
            if (!promptMessage || promptMessage.role !== 'user' || !promptMessage.content) {
                 this.postMessage({ type: 'error', requestId, payload: { error: 'Invalid payload for generate-prompt. Expected { role: "user", content: "..." }.' } });
                 return;
            }

            try {
                // Prepare API request body - assumes the API takes a list of messages
                // We send the constructed prompt as a single user message.
                const apiMessages = [promptMessage]; // Use the received payload directly

                const requestBody = {
                    model: this.config.model,
                    stream: false, // Keep streaming false for now
                    messages: apiMessages
                };

                console.log(`${this.name}: Sending request to API: ${this.config.endpoint}. ReqID: ${requestId}`);
                const response = await fetch(this.config.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.apiKey}`,
                        // 'api-key': this.config.apiKey // Uncomment for Azure OpenAI
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`API call failed with status ${response.status}: ${errorBody}`);
                }

                const respData = await response.json();
                console.log(`${this.name}: API Response received. ReqID: ${requestId}`, respData);

                // Extract assistant message (OMF Chat Message format)
                const assistantMessageContent = respData.choices?.[0]?.message?.content;
                if (!assistantMessageContent) {
                     throw new Error('Invalid API response structure. Could not find message content.');
                }
                const assistantMessagePayload = {
                    role: respData.choices[0].message.role || 'assistant',
                    content: assistantMessageContent
                };

                // Send the successful response back using the received requestId
                this.postMessage({ type: 'response', requestId, payload: assistantMessagePayload });
                console.log(`${this.name}: Sent assistant response. ReqID: ${requestId}`);

            } catch (error) {
                console.error(`${this.name}: Error processing '${type}' (ReqID: ${requestId}):`, error);
                // Send error back using the received requestId
                this.postMessage({ type: 'error', requestId, payload: { error: `Failed to generate response: ${error.message}` } });
            }

        } else {
            // If it's not a type this worker handles, let BaseWorker deal with it
            super.handleCustomMessage(messageData);
        }
    }
}

const openAIWorker = new OpenAIWorker();
// BaseWorker's onConnect handles the connection setup.
self.onconnect = (event) => {
    openAIWorker.onConnect(event);
};

console.log('OpenAI Worker (Shared): Script loaded, instance created, waiting for connections.');