// --- PKCE Helper Functions ---

// Generates a random string of a given length (min 43, max 128 recommended for verifier).
function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const charactersLength = characters.length;
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues); // Use browser's crypto for secure random numbers
    for (let i = 0; i < length; i++) {
        result += characters.charAt(randomValues[i] % charactersLength);
    }
    return result;
}

// Calculates the SHA256 hash of a string. Returns a Promise<ArrayBuffer>.
async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return await crypto.subtle.digest('SHA-256', data);
}

// Base64 URL encodes an ArrayBuffer.
function base64UrlEncode(arrayBuffer) {
    // Convert the ArrayBuffer to a Uint8Array, then to a string of char codes
    const uint8Array = new Uint8Array(arrayBuffer);
    const charCodes = String.fromCharCode.apply(null, uint8Array);
    // Base64 encode the string
    const base64 = btoa(charCodes);
    // Convert Base64 to Base64URL encoding (replace + with -, / with _, remove trailing =)
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Generates the code_challenge from the code_verifier using SHA256. Returns a Promise<string>.
async function generateCodeChallenge(verifier) {
    const hashed = await sha256(verifier);
    return base64UrlEncode(hashed);
}

// --- End PKCE Helper Functions ---


chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

let userInfo = null; // Cache user info (can hold Google or Microsoft info)

// Function to get Google auth token and fetch user info
async function authenticateAndGetUserInfo() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error("Google Authentication failed:", chrome.runtime.lastError?.message);
        reject(chrome.runtime.lastError || new Error("Failed to get Google auth token."));
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
             console.log("Removed potentially invalid Google cached token.");
          });
          throw new Error(`Failed to fetch Google user info: ${response.statusText}`);
        }

        const fetchedUserInfo = await response.json();
        console.log("Google user info fetched:", fetchedUserInfo);
        // Update cache with Google info
        userInfo = {
            provider: "google",
            email: fetchedUserInfo.email,
            name: fetchedUserInfo.name,
            picture: fetchedUserInfo.picture // Google provides picture directly
        };
        resolve(userInfo);
      } catch (error) {
        console.error("Error fetching Google user info:", error);
        reject(error);
      }
    });
  });
}

// Listen for messages from the UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // --- Google Login (Interactive) ---
  if (message.type === 'getUserInfo') {
    console.log("Received interactive Google login request ('getUserInfo').");
    // Check cache first
    if (userInfo && userInfo.provider === 'google') {
      console.log("Returning cached Google user info.");
      sendResponse({ success: true, data: userInfo });
    } else {
      console.log("No cached Google info, attempting interactive authentication...");
      // Call the main function which uses interactive: true by default
      authenticateAndGetUserInfo() // This function already handles caching on success
        .then(fetchedInfo => sendResponse({ success: true, data: fetchedInfo }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
    }
  }

  // --- Google Login (Silent) ---
  else if (message.type === 'googleLoginSilent') {
    console.log("Received silent Google login request.");
    // Try getting token non-interactively
    chrome.identity.getAuthToken({ interactive: false }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        // Silent fail is expected if user isn't logged in or hasn't consented
        console.log("Silent Google login failed:", chrome.runtime.lastError?.message || "No token obtained (requires interaction).");
        sendResponse({ success: false, error: chrome.runtime.lastError?.message || "Silent Google login failed." });
        return;
      }
      // If token obtained silently, fetch user info
      console.log("Silent Google token obtained, fetching user info...");
      try {
        const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Silent Google user info fetch failed: ${response.statusText}`);
        const fetchedUserInfo = await response.json();
        console.log("Silent Google user info fetched:", fetchedUserInfo);
        // Update cache
        userInfo = { provider: "google", email: fetchedUserInfo.email, name: fetchedUserInfo.name, picture: fetchedUserInfo.picture };
        sendResponse({ success: true, data: userInfo });
      } catch (error) {
        console.error("Error fetching silent Google user info:", error);
        // Clear potentially bad token? Maybe not necessary for silent fail.
        sendResponse({ success: false, error: error.message });
      }
    });
    return true; // Async response
  }

  // --- Microsoft Login (Interactive) ---
  else if (message.type === 'microsoftLogin') {
    console.log("Received interactive Microsoft login request.");
    handleMicrosoftLogin(true, sendResponse); // Use interactive: true
    return true; // Async response
  }

  // --- Microsoft Login (Silent) ---
  else if (message.type === 'microsoftLoginSilent') {
    console.log("Received silent Microsoft login request.");
    handleMicrosoftLogin(false, sendResponse); // Use interactive: false
    return true; // Async response
  }

  // --- Other message types ---
  else {
    console.log("Received unknown message type:", message.type);
    return false; // Indicate synchronous or no response needed
  }
});


// --- Refactored Microsoft Login Handler ---
// Takes 'interactive' boolean and sendResponse callback
function handleMicrosoftLogin(isInteractive, sendResponse) {
    // const clientId = "9d230984-b6a4-426c-bf9a-a98ada5db082";
    // const tenantId = "common";
    const clientId = "f5df8be3-4473-4c28-b74d-bac0671b4dd8"
    const tenantId = "e741d71c-c6b6-47b0-803c-0f3b32b07556";
    const scopes = ["openid", "profile", "email", "User.Read"];
    const redirectUri = `https://` + chrome.runtime.id + `.chromiumapp.org/`;

    const codeVerifier = generateRandomString(64);
    generateCodeChallenge(codeVerifier).then(codeChallenge => {
        let authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?`;
        authUrl += `client_id=${clientId}`;
        authUrl += `&response_type=code`;
        authUrl += `&redirect_uri=${encodeURIComponent(redirectUri)}`;
        authUrl += `&scope=${encodeURIComponent(scopes.join(" "))}`;
        authUrl += `&response_mode=query`;
        authUrl += `&code_challenge=${codeChallenge}`;
        authUrl += `&code_challenge_method=S256`;
        // Add state if needed

        console.log(`Initiating Microsoft Auth Code flow (Interactive: ${isInteractive}). Auth URL:`, authUrl);

        chrome.identity.launchWebAuthFlow(
            {
                url: authUrl,
                interactive: isInteractive,
                ...(isInteractive ? {} : { abortOnLoadForNonInteractive: true, timeoutMsForNonInteractive: 15000 }) // Add options for non-interactive flow, increased timeout
            },
            (responseUrl) => {
                if (chrome.runtime.lastError || !responseUrl) {
                    const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : `Login cancelled or failed (Interactive: ${isInteractive}).`;
                    // For silent failures, this is often expected, don't log as a hard error unless debugging
                    if (isInteractive || (chrome.runtime.lastError && chrome.runtime.lastError.message !== "User interaction required.")) {
                       console.log(`Microsoft Auth Code flow failed (Step 1): ${errorMsg}`);
                    } else {
                       console.log(`Silent Microsoft login failed as expected: ${errorMsg}`);
                    }
                    sendResponse({ success: false, error: `Microsoft login failed: ${errorMsg}` });
                    return;
                }
                console.log("Microsoft Auth Code flow step 1 successful. Response URL:", responseUrl);

                let code;
                try {
                    const url = new URL(responseUrl);
                    code = url.searchParams.get('code');
                    if (!code) {
                        const error = url.searchParams.get('error');
                        const errorDescription = url.searchParams.get('error_description');
                        if (error) { throw new Error(`OAuth error in redirect: ${error} - ${errorDescription}`); }
                        throw new Error("Authorization code not found.");
                    }
                    console.log("Extracted Authorization Code.");
                } catch (error) {
                    console.error("Error parsing auth code:", error);
                    sendResponse({ success: false, error: `Error processing redirect: ${error.message}` });
                    return;
                }

                const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
                const tokenRequestBody = new URLSearchParams({
                    client_id: clientId, scope: scopes.join(" "), code: code,
                    redirect_uri: redirectUri, grant_type: 'authorization_code',
                    code_verifier: codeVerifier
                });

                (async () => {
                  try {
                    console.log("Exchanging code for token...");
                    const tokenResponse = await fetch(tokenUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                      body: tokenRequestBody.toString(),
                    });

                    if (!tokenResponse.ok) {
                      let errorData;
                      try {
                        errorData = await tokenResponse.json();
                        throw new Error(`Token exchange failed (${tokenResponse.status}): ${errorData.error_description || JSON.stringify(errorData)}`);
                      } catch {
                        throw new Error(`Token exchange failed (${tokenResponse.status})`);
                      }
                    }

                    const tokenData = await tokenResponse.json();
                    const accessToken = tokenData.access_token;
                    // Save the Microsoft access token for later use in the side panel via extension storage
                    chrome.storage.local.set({ microsoftAccessToken: accessToken }, () => {
                      console.log('Microsoft access token saved in extension storage.');
                    });
                    if (!accessToken) {
                      throw new Error("Access token missing in response.");
                    }
                    console.log("Access Token obtained.");
                    userInfo = null; // Clear cache before fetching new info

                    console.log("Fetching MS Graph user info...");
                    const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
                      headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    if (!graphResponse.ok) {
                      let errorData;
                      try {
                        errorData = await graphResponse.json();
                        throw new Error(`Graph API failed (${graphResponse.status}): ${errorData.error?.message || JSON.stringify(errorData)}`);
                      } catch {
                        throw new Error(`Graph API failed (${graphResponse.status})`);
                      }
                    }

                    const graphUserInfo = await graphResponse.json();
                    console.log("MS Graph User Info obtained:", graphUserInfo);
                    // Update cache
                    userInfo = {
                      provider: "microsoft",
                      name: graphUserInfo.displayName,
                      email: graphUserInfo.mail || graphUserInfo.userPrincipalName,
                      picture: null
                    };
                    sendResponse({ success: true, data: userInfo });
                  } catch (error) {
                    console.error("Error in token exchange or Graph API call:", error);
                    sendResponse({ success: false, error: `MS login process failed: ${error.message}` });
                  }
                })();
            } // End launchWebAuthFlow callback
        ); // End launchWebAuthFlow call
    }).catch(pkceError => {
        console.error("Error generating PKCE challenge:", pkceError);
        sendResponse({ success: false, error: `Failed to prepare secure login: ${pkceError.message}` });
    }); // End generateCodeChallenge().then()
} // End handleMicrosoftLogin

// Optional: Trigger authentication proactively when the extension starts (REMOVED)
// authenticateAndGetUserInfo().catch(err => console.log("Initial auth attempt failed:", err));