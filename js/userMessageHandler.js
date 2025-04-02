const workerUrl = new URL('./userMessageWorker.js', import.meta.url);
const worker = new SharedWorker(workerUrl, { name: 'userMessageWorker',type: 'module' });

// Event listener for messages from the worker
worker.port.addEventListener('message', (event) => {
    const agentMessageEvent = new CustomEvent('agent-message', {
        detail: event.data
    });
    document.dispatchEvent(agentMessageEvent);
});

worker.port.start();

// Function to send user messages to the worker
function sendUserMessage(message) {
    if (!message || typeof message !== 'object' || !message.content) {
        console.error('Invalid message. Please provide a valid LLM message payload.');
        return;
    }

    // Add default name if not provided
    if (!message.name) {
        message.name = 'user';
    }

    worker.port.postMessage({ type: 'user-message', payload: message });
}

export { sendUserMessage };