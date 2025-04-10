// SharedWorker that echoes messages back with a prefix
import BaseWorker from './base.js';

export class EchoWorker extends BaseWorker {
    constructor() {
        super();
        this.name = "echo";
        this.config.user = "Echo";
        this.config.content = "Echo, {userContent}, from {user} as {role}";
        }

        // Override BaseWorker's handleCustomMessage
        // Receives the full OMF message data object
        handleCustomMessage(messageData) {
            // Destructure OMF fields
            // 'requestId' contains the full request ID chain received.
            const { type, name, payload, requestId } = messageData;

            // EchoWorker specifically handles 'user-message' type for echoing
            // Or potentially a specific command type like 'echo-request'
            if (type === 'user-message' && payload?.content) {
                console.log(`${this.name}: Received user-message from '${name || 'Unknown'}' to echo. ReqID: ${requestId || 'None'}`);

                // Replace placeholders in the configured echo format
                let content = this.config.content // Use configured format string
                    .replace("{userContent}", payload.content) // Insert original content
                    .replace("{user}", this.config.user) // Insert EchoWorker's configured user name
                    .replace("{role}", this.config.role); // Insert EchoWorker's configured role

                const responsePayload = {
                    // Include relevant info in the response payload
                    originalSender,
                    originalContent: payload.content,
                    echoedContent: content,
                    role: this.config.role // Echo worker's role
                };

                // Send the response back using OMF via inherited postMessage
                // Use type 'response' and include the original received requestId chain
                // for proper correlation by the requester/router.
                this.postMessage({ type: 'response', payload: responsePayload, requestId: requestId });

            } else {
                // For any other message type, call the base class's handler
                // which will log a warning and send an 'unhandled type' error.
                super.handleCustomMessage(messageData);
            }
    }
}

const echoWorker = new EchoWorker();
onconnect = (event) => echoWorker.onConnect(event);