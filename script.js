import { sendUserMessage } from './js/userMessageHandler.js';
import { addWorker } from './js/workerRegistry.js';

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
    if (!message || typeof message !== 'object' ) {
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

    const response = sendUserMessage(message);
    // chat.addMessage(response, "received"); 
});


//TODO make UI for this configuration
// use workerRegistry to add messageCacheWorker
addWorker({
    name: 'messageCacheWorker',
    type: 'SharedWorker',
    uri: './js/messageCacheWorker.js'
}).then(() => {
    console.log('Worker added to registry.');
}).catch((error) => {
    console.error('Error adding worker to registry:', error);
});