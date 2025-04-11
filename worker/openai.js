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
        const { type, name, payload, requestId } = messageData.data;

            const promptMessage = payload;

            console.log(`${this.name}: Received '${type}' from '${name || 'Unknown'}'. ReqID: ${requestId || 'None'}`);

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
                if (this.config.apiKey === "") error.message = "API key is missing. Please set the API key in the worker configuration.";
                else if (this.config.endpoint === "") error.message = "API endpoint is missing. Please set the endpoint in the worker configuration.";
                else if (this.config.model === "") error.message = "Model name is missing. Please set the model in the worker configuration.";
                console.error(`${this.name}: Error processing '${type}' (ReqID: ${requestId}):`, error.message);
                // Send error back using the received requestId
                this.postMessage({ type: 'error', requestId, payload: { error: `Failed to generate response: ${error.message}` } });
            }

            // super.handleCustomMessage(messageData);
    }
}

const openAIWorker = new OpenAIWorker();
// BaseWorker's onConnect handles the connection setup.
self.onconnect = (event) => {
    openAIWorker.onConnect(event);
};

console.log('OpenAI Worker (Shared): Script loaded, instance created, waiting for connections.');