// import { sendUserMessage } from './js/userMessageHandler.js';
import { WorkerRegistry } from './js/workerRegistry.js';

const worker_registry = new WorkerRegistry();
worker_registry.initRouter();

// Responsive-list related code.
const list = document.getElementById('myList');

// Listen for item selection events.
list.addEventListener('item-selected', (e) => {
    console.log('Item selected:', e.detail);
});

// Listen for option button clicks.
list.addEventListener('option-click', (e) => {
    console.log('Option clicked:', e.detail);
});

// Add some sample items.
list.addItem({
    icon: 'https://icons.veryicon.com/png/o/miscellaneous/40px/image-104.png',
    title: 'First Item',
    description: 'This is the description for the first item. It appears when the item is selected.',
    options: [
        { icon: '✏️', action: 'edit' },
        { icon: '🗑️', action: 'delete' }
    ]
});

list.addItem({
    icon: 'https://icons.veryicon.com/png/o/miscellaneous/40px/image-104.png',
    title: 'Second Item',
    description: 'Detailed info for the second item. Click to reveal.',
    options: [
        { icon: 'ℹ️', action: 'info' }
    ]
});

list.addItem({
    icon: 'https://icons.veryicon.com/png/o/miscellaneous/40px/image-104.png',
    title: 'Third Item',
    description: 'Description of the third item goes here.',
    options: [
        { icon: '✏️', action: 'edit' },
        { icon: '🗑️', action: 'delete' },
        { icon: '🔍', action: 'view' }
    ]
});

// Toolbar related code.
const toolbar = document.getElementById('myToolbar');

// Use the addComponent API to add various components.
toolbar.addComponent('button', 'Click Me | doClickMessage');
toolbar.addComponent('input', 'Enter Name: | doName');
toolbar.addComponent('toggle', 'Enable Feature | doToggle');
toolbar.addComponent('select', 'Choose Option | doSelect | Option 1, Option 2, Option 3');

// Listen for toolbar actions.
toolbar.addEventListener('toolbar-action', (e) => {
    console.log('Toolbar action:', e.detail.action, 'Value:', e.detail.value);
});

// Chat-window related code.
const chat = document.querySelector('chat-window');

// Toggle chat when the down arrow is pressed.
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
        chat._toggleChat(chat);
    }
});

// Listen for chat events.
chat.addEventListener('chat-opened', () => {
    console.log('Chat window opened.');
});

chat.addEventListener('chat-closed', () => {
    console.log('Chat window closed.');
});

document.addEventListener('agent-message', (e) => {
    console.log('Agent message received:', e.detail);
    const message = e.detail;

    // Validate the message object
    if (!message || typeof message !== 'object') {
        console.error('Invalid message structure:', message);
        chat.addMessage({ content: 'Error: Invalid message format.' }, "received");
        return;
    }

    chat.addMessage(message.payload.content, "received");
});


chat.addEventListener('chat-message', (e) => {
    console.log('User sent message:', e.detail.message);
    const message = e.detail.message;

    // Validate the message object
    if (!message || typeof message !== 'object' || !message.content) {
        console.error('Invalid message structure:', message);
        chat.addMessage({ content: 'Error: Invalid message format.' }, "received");
        return;
    }

    const response = worker_registry.sendUserMessage(message);
    // chat.addMessage(response, "received"); 
});

 // Fetch request to the external API
 fetch("https://litellm.weolopez.com/chat/completions", {
    headers: {
        "accept": "application/json",
        "accept-language": "en-US,en;q=0.9,es;q=0.8,es-ES;q=0.7,es-US;q=0.6",
        "authorization": "Bearer sk-51MK8oRHrynbJxKW2d5WAQ",
        "cache-control": "no-cache",
        "content-type": "application/json",
        "pragma": "no-cache",
        "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-stainless-arch": "unknown",
        "x-stainless-lang": "js",
        "x-stainless-os": "Unknown",
        "x-stainless-package-version": "4.28.0",
        "x-stainless-runtime": "browser:chrome",
        "x-stainless-runtime-version": "134.0.0"
    },
    referrer: "https://litellm.weolopez.com/ui/?userID=default_user_id&page=llm-playground",
    referrerPolicy: "strict-origin-when-cross-origin",
    body: JSON.stringify({
        model: "gemini",
        stream: true,
        messages: [
            { role: "user", content: "Tell me a joke" }
        ]
    }),
    method: "POST",
    mode: "cors",
    credentials: "include"
})
.then(response => response.json())
.then(data => {
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
        chat.addMessage({ content: data.choices[0].message.content }, "received");
    } else {
        chat.addMessage({ content: 'Error: Invalid response from server.' }, "received");
    }
})
.catch(error => {
    console.error('Error fetching response:', error);
    chat.addMessage({ content: 'Error: Unable to fetch response.' }, "received");
});