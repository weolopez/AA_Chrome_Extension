chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

let userInfo = null; // Cache user info

// Function to get auth token and fetch user info
async function authenticateAndGetUserInfo() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error("Authentication failed:", chrome.runtime.lastError?.message);
        reject(chrome.runtime.lastError || new Error("Failed to get auth token."));
        return;
      }

      try {
        const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          // Attempt to remove the cached token if invalid
          chrome.identity.removeCachedAuthToken({ token: token }, () => {
             console.log("Removed potentially invalid cached token.");
          });
          throw new Error(`Failed to fetch user info: ${response.statusText}`);
        }

        const fetchedUserInfo = await response.json();
        console.log("User info fetched:", fetchedUserInfo);
        userInfo = { // Store relevant info
            email: fetchedUserInfo.email,
            name: fetchedUserInfo.name,
            picture: fetchedUserInfo.picture
        };
        resolve(userInfo);
      } catch (error) {
        console.error("Error fetching user info:", error);
        reject(error);
      }
    });
  });
}

// Listen for messages from the UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getUserInfo') {
    if (userInfo) {
      console.log("Returning cached user info:", userInfo);
      sendResponse({ success: true, data: userInfo });
    } else {
      console.log("No cached user info, attempting authentication...");
      authenticateAndGetUserInfo()
        .then(fetchedInfo => {
          sendResponse({ success: true, data: fetchedInfo });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicates that the response is sent asynchronously
    }
  } 
  // Handle other message types if needed
  return false; // Indicates synchronous response or no response needed now for other types
});

// Optional: Trigger authentication proactively when the extension starts
// authenticateAndGetUserInfo().catch(err => console.log("Initial auth attempt failed:", err));