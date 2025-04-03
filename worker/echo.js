// SharedWorker that echoes messages back with a prefix
import BaseWorker from './base.js';

export class EchoWorker extends BaseWorker {
    constructor() {
        super();
        this.config.user = "Echo";
        this.config.content = "Echo, {userContent}, from {user} as {role}";
        }

        handleCustomMessage(type, payload, port) {
        if (type === 'user-message') {
            // Replace the placeholder with the actual content from the payload
            let content = this.config.content
                .replace("{userContent}", payload.content)
                .replace("{user}", this.config.user)
                .replace("{role}", this.config.role);
            const responsePayload = {
            user: this.config.user,
            role: this.config.role,
            content 
            };
            port.postMessage({ type: 'worker-message', payload: responsePayload });
        } else {
            super.handleCustomMessage(type, payload, port);
        }
    }
}

const echoWorker = new EchoWorker();
onconnect = (event) => echoWorker.onConnect(event);