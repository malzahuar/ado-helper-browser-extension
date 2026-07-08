importScripts('oauth.js');

// One OAuth instance per Client ID, reused across messages. State is cheap
// (clientId/scope/redirectUri) — the actual token always lives in
// chrome.storage.local, so losing this map on service worker restart is safe.
const oauthInstancesByClientId = new Map();

function getOAuthInstance(clientId) {
    if (!oauthInstancesByClientId.has(clientId)) {
        oauthInstancesByClientId.set(clientId, new OAuth(clientId));
    }
    return oauthInstancesByClientId.get(clientId);
}

const AUTH_MESSAGE_TYPES = new Set([
    'ADO_HELPER_AUTH_GET_TOKEN',
    'ADO_HELPER_AUTH_LOGIN',
    'ADO_HELPER_AUTH_LOGOUT',
    'ADO_HELPER_AUTH_IS_AUTHENTICATED'
]);

// Runs all Entra ID token acquisition, storage, and refresh here in the
// background service worker. Content scripts (which share a world with
// whatever page they're injected into) only ever get a short-lived access
// token over sendMessage — the refresh token never leaves this context.
async function handleAuthMessage(message) {
    try {
        const oauth = getOAuthInstance(message.clientId);
        switch (message.type) {
            case 'ADO_HELPER_AUTH_GET_TOKEN':
                return { token: await oauth.getValidToken() };
            case 'ADO_HELPER_AUTH_LOGIN':
                await oauth.login();
                return { success: true };
            case 'ADO_HELPER_AUTH_LOGOUT':
                await oauth.logout();
                return { success: true };
            case 'ADO_HELPER_AUTH_IS_AUTHENTICATED':
                return { isAuthenticated: await oauth.isAuthenticated() };
        }
    } catch (error) {
        return { error: error.message || String(error) };
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !AUTH_MESSAGE_TYPES.has(message.type)) {
        return false;
    }
    handleAuthMessage(message).then(sendResponse);
    return true;
});

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Extension installed, loading default settings...');
        loadDefaultSettings();
    }
});

// Function to load default settings from JSON
function loadDefaultSettings() {
    fetch(chrome.runtime.getURL('src/defaultData.json'))
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch defaultData.json');
            }
            return response.json();
        })
        .then(data => {
            console.log('Default data loaded from JSON:', data);
            const defaultSettings = {
                issueTag: data.issueTag || 'bugfix',
                userStoryTag: data.userStoryTag || 'feature',
                formatSeparator: data.formatSeparator || '-',
                branchHotfixVersion: data.branchHotfixVersion || '{major}{minor}',
                adoOrganization: data.adoOrganization || '',
                adoProject: data.adoProject || '',
                tableData: data.tableData || [],
                // OAuth configuration (to be filled by user)
                adoClientId: data.adoClientId || ''
            };

            console.log('Saving default settings to storage:', defaultSettings);
            
            // Save default settings to Chrome storage
            chrome.storage.sync.set(defaultSettings, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving default settings:', chrome.runtime.lastError);
                } else {
                    console.log('Default settings saved successfully to storage');
                }
            });
        })
        .catch(error => {
            console.error('Error loading default data:', error);
        });
}
