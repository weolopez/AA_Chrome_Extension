// Function to update the UI with user info
function updateUserInfoDisplay(userInfoData) {
    const userInfoDisplay = document.getElementById('user-info-display');
    const loginButtonsDiv = document.getElementById('login-buttons'); // Container for login buttons
    const logoutButton = document.getElementById('logout-button'); // New logout button element

    // Ensure the main container is visible (its visibility is now controlled by CSS z-index)
    const userInfoContainer = document.getElementById('user-info-container');
    if (userInfoContainer) userInfoContainer.style.display = 'flex'; // Ensure header container itself is visible

    if (!userInfoDisplay || !loginButtonsDiv) {
        console.error("UI elements for user info display or login buttons not found.");
        return;
    }

    if (userInfoData && userInfoData.name) {
        // Logged IN state: Update text and show logout button while hiding login buttons
        const provider = userInfoData.provider === 'microsoft' ? 'Microsoft' : 'Google';
        userInfoDisplay.textContent = `Welcome, ${userInfoData.name}! (via ${provider})`;
        loginButtonsDiv.style.display = 'none'; // Hide the login buttons
        
        if (logoutButton) {
            logoutButton.style.display = 'flex'; // Show the logout button
        }
        console.log("User logged in, showing logout button.");
    } else {
        // Logged OUT state: Update text and show login buttons, hide logout button
        userInfoDisplay.textContent = 'Please log in.';
        loginButtonsDiv.style.display = 'flex'; // Show the login buttons
        
        if (logoutButton) {
            logoutButton.style.display = 'none'; // Hide the logout button
        }
        console.log("User logged out, hiding logout button.");
    }
}
function requestLogout() {
    console.log("Logout requested.");
    chrome.runtime.sendMessage({ type: 'logout' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Logout error:", chrome.runtime.lastError.message);
        }
        // Remove saved user info
        chrome.storage.local.remove('userInfo', () => {
            console.log("User info removed from storage");
        });
        updateUserInfoDisplay(null);
    });
}
function requestGoogleUserInfo() {
    console.log("requestGoogleUserInfo function called.");
    const userInfoDisplay = document.getElementById('user-info-display');
    if (!userInfoDisplay) return;

    userInfoDisplay.textContent = 'Checking Google login...';

    chrome.runtime.sendMessage({ type: 'getUserInfo' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Error sending/receiving Google user info:", chrome.runtime.lastError.message);
            updateUserInfoDisplay(null);
            return;
        }

        if (response && response.success && response.data) {
            console.log("Received Google user info:", response.data);
            // Save the user info (including token) in chrome storage
            chrome.storage.local.set({ userInfo: { ...response.data, provider: 'google' } }, () => {
                console.log("Google user info saved");
            });
            updateUserInfoDisplay({ ...response.data, provider: 'google' });
        } else {
            console.log("Failed to get Google user info:", response ? response.error : 'No response');
            updateUserInfoDisplay(null);
        }
    });
}

function requestMicrosoftLogin() {
    console.log("requestMicrosoftLogin function called.");
    const userInfoDisplay = document.getElementById('user-info-display');
    if (userInfoDisplay) userInfoDisplay.textContent = 'Initiating Microsoft login...';

    chrome.runtime.sendMessage({ type: 'microsoftLogin' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Error sending/receiving Microsoft login:", chrome.runtime.lastError.message);
            updateUserInfoDisplay(null);
            alert(`Microsoft Login Error: ${chrome.runtime.lastError.message}`);
            return;
        }

        if (response && response.success && response.data) {
            console.log("Received Microsoft user info:", response.data);
            // Save the user info (including token) in chrome storage
            chrome.storage.local.set({ userInfo: response.data }, () => {
                console.log("Microsoft user info saved");
            });
            updateUserInfoDisplay(response.data);
        } else {
            console.error("Microsoft login failed:", response ? response.error : 'No response');
            updateUserInfoDisplay(null);
            alert(`Microsoft Login Failed: ${response ? response.error : 'Unknown error'}`);
        }
    });
}
// Gemini function 'callGemini' removed.


// --- Silent Login Flow ---

function attemptSilentLogins() {
    console.log("Attempting silent Microsoft login...");
    updateUserInfoDisplay({ status: 'loading', message: 'Attempting auto-login...' }); // Show loading state

    chrome.runtime.sendMessage({ type: 'microsoftLoginSilent' }, (msResponse) => {
        if (msResponse && msResponse.success) {
            console.log("Silent Microsoft login successful.");
            updateUserInfoDisplay(msResponse.data); // Update UI with MS user data
        } else {
            console.log("Silent Microsoft login failed, attempting silent Google login...");
            // If MS silent fails, try Google silent
            chrome.runtime.sendMessage({ type: 'googleLoginSilent' }, (googleResponse) => {
                if (googleResponse && googleResponse.success) {
                    console.log("Silent Google login successful.");
                    updateUserInfoDisplay(googleResponse.data); // Update UI with Google user data
                } else {
                    console.log("Both silent logins failed. Showing manual login buttons.");
                    updateUserInfoDisplay(null); // Show logged-out state with buttons
                }
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired.");

    // Find buttons
    const msLoginButton = document.getElementById('microsoft-login-button');
    const googleLoginButton = document.getElementById('google-login-button');
    const logoutButton = document.getElementById('logout-button');

    // Attach INTERACTIVE listeners for login buttons
    if (msLoginButton) {
        console.log("Microsoft login button found.");
        msLoginButton.addEventListener('click', requestMicrosoftLogin);
        console.log("Added INTERACTIVE click listener to Microsoft button.");
    } else {
        console.error("Microsoft login button not found.");
    }
    if (googleLoginButton) {
        console.log("Google login button found.");
        googleLoginButton.addEventListener('click', requestGoogleUserInfo);
        console.log("Added INTERACTIVE click listener to Google button.");
    } else {
        console.error("Google login button not found.");
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', requestLogout);
    }

    // Check if user info is already saved
    chrome.storage.local.get('userInfo', (result) => {
        if (result.userInfo) {
            console.log("Loaded saved user info:", result.userInfo);
            updateUserInfoDisplay(result.userInfo);
        } else {
            // If no saved info, try silent login flows
            attemptSilentLogins();
        }
    });
});

// import { sendUserMessage } from './js/userMessageHandler.js';
import { WorkerRegistry } from './js/workerRegistry.js';
import { markdownToHtml } from './js/markdown-formatter.js'; // Import the markdown formatter

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
    const message = e.detail; // This is the data relayed from the worker via the router
    // Destructure OMF fields (name is the original sender worker)
    const { type, name: senderName, payload, requestId, error: messageError } = message;

    console.log(`Agent message received from '${senderName || 'Unknown'}':`, message);

    // Validate the basic message structure
    if (!type) { // Check for type, as name/payload might be missing in malformed messages
        console.error('Invalid agent message structure (missing type):', message);
        if (chat && typeof chat.addMessage === 'function') {
            chat.addMessage({ content: `Error: Received invalid message structure from agent '${senderName || 'Unknown'}' (missing type).` }, "error");
        }
        return;
    }

    // Handle different message types
    // Handle different message types based on OMF 'type'
    switch (type) {
        case 'result':
            // Assuming 'result' type contains the actual message payload to display
            // Payload structure might vary, adapt as needed
            if (payload && typeof payload === 'object' && payload.content) {
                // Format the actual content using the markdown formatter
                const formattedContent = markdownToHtml(payload.content);
                // Determine the role for display - use senderName or payload.role
                // Example: Use 'received' for assistant/system roles, otherwise maybe use senderName?
                const displayRole = (payload.role === 'assistant' || payload.role === 'system') ? 'received' : (senderName || 'system'); // Adjust logic
                chat.addMessage({ content: formattedContent }, displayRole);
            } else {
                console.warn(`Agent message type "result" from '${senderName || 'Unknown'}' received without valid payload.content:`, message);
                // Optionally display raw payload or a placeholder
                 chat.addMessage({ content: `Received result from ${senderName || 'Unknown'}: ${JSON.stringify(payload)}` }, "system");
            }
            break;
        case 'status':
            // Payload for status might be a string or object
            console.log(`Agent status update from '${senderName || 'Unknown'}':`, payload, messageError || '');
            // Optionally display status updates in the chat
            chat.addMessage( `Status: ${JSON.stringify(message.payload, null, 2)}`);
                // { content: `Status [${senderName || 'Unknown'}]: ${JSON.stringify(payload)}` }, "system");
            break;
        case 'error':
            // Error payload should ideally contain an 'error' message string
            const errorContent = messageError || payload?.error || JSON.stringify(payload);
            console.error(`Agent error from '${senderName || 'Unknown'}': ${errorContent}`, message);
            if (chat && typeof chat.addMessage === 'function') {
                 chat.addMessage(`Error from ${senderName}  ${JSON.stringify(message.payload, null, 2)}`);
            }
            break;
        default:
            if (message.payload.role === 'assistant') {
                chat.addMessage(message.payload.content, 'received');
            } else {
                console.log(`Unhandled agent message type:  ${JSON.stringify(message, null, 2)}`, message);
                chat.addMessage(`${JSON.stringify(message.payload, null, 2)}`);
            }
    }
});


// Original chat listener using WorkerRegistry
chat.addEventListener('chat-message', async (e) => { // Make listener async for addWorker call
    chat.customHistory(e.detail.message)
    console.log('User sent message:', e.detail.message);
    const message = e.detail.message;
    const userRequestId = `user-${crypto.randomUUID()}`;

    // Validate the message object
    if (!message || typeof message !== 'object' || !message.content) {
        console.error('Invalid message structure:', message);
        if (chat && typeof chat.addMessage === 'function') {
             chat.addMessage({ content: 'Error: Invalid message format.' }, "error");
        } else {
             const chatWindow = document.querySelector('chat-window');
             if (chatWindow) chatWindow.addMessage({ content: 'Error: Invalid message format.' }, "error");
        }
        return;
    }

    const messageContent = message.content.trim();

    // Check for slash commands
    if (messageContent.startsWith('/')) {
        const parts = messageContent.split(' ');
        const command = parts[0];
        const args = parts.slice(1);

        if (command === '/worker' && args[0] === 'add' && args.length === 2) {
            const workerName = args[1];
            console.log(`Command received: /worker add ${workerName}`);
            try {
                // Provide feedback to the user
                chat.addMessage({ content: `Attempting to add worker: ${workerName}...` }, "system");
                // Call the addWorker method
                // Note: Assumes a corresponding '../worker/${workerName}.js' file exists.
                await worker_registry.addWorker(workerName); // Pass only name for now
                chat.addMessage({ content: `Worker '${workerName}' added successfully. Assumes '../worker/${workerName}.js' exists.` }, "system");
            } catch (error) {
                console.error(`Failed to add worker '${workerName}':`, error);
                chat.addMessage({ content: `Error adding worker '${workerName}': ${error.message}` }, "error");
            }
        } else if (command === '/config') {
            if (args[0] === 'save') {
                worker_registry.saveConfig();
                return
            } else if (args[0] === 'restore') {
                worker_registry.restoreConfig();
                return;
            }
            // Construct the OMF message
            const omfMessage = {
                type: 'user-message',
                name: 'MainUI', // Identify the sender as the main UI
                requestId: userRequestId, // Use the generated ID as the base for the chain
                payload: message // The original message object { role: 'user', content: '...' }
            };

            // Send the full OMF message to the WorkerRegistry
            worker_registry.sendUserMessage(omfMessage); 
        } else {
            // Handle unknown commands or incorrect usage
            console.warn(`Unknown or invalid command: ${messageContent}`);
            chat.addMessage({ content: `Unknown or invalid command: ${messageContent}` }, "system");
        }
    } else {
        // Logic for regular user messages (not commands)
        console.log("Processing regular user message...");
        // Generate the base user request ID for this entire user interaction.
        // This ID will be propagated through the worker chain for tracing.
        console.log(`Generated userRequestId: ${userRequestId}`);

        // Construct the OMF message
        const omfMessage = {
            type: 'user-message',
            name: 'MainUI', // Identify the sender as the main UI
            requestId: userRequestId, // Use the generated ID as the base for the chain
            payload: message // The original message object { role: 'user', content: '...' }
        };

        // Send the full OMF message to the WorkerRegistry
        worker_registry.sendUserMessage(omfMessage);
        // Handle response from worker_registry if needed (e.g., display it)
    }
    // if (response) {
    //    if (chat && typeof chat.addMessage === 'function') chat.addMessage(response, "received");
    // }
});


var _history = JSON.parse(localStorage.getItem('slidingPanelHistory')) || [];
var _history_index = 0;
chat.customHistory = function(value){
  if (value) {
    if (!_history.includes(value.content)) {
        _history.push(value.content);
        localStorage.setItem('slidingPanelHistory', JSON.stringify(_history));
    }
  } else {
    if (_history.length > 0) {
      _history_index = (_history_index + 1) % _history.length;
      return _history[_history_index];
    }
  }
}
