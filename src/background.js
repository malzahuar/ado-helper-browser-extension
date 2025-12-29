// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Extension installed, loading default settings...');
        loadDefaultSettings();
    } else if (details.reason === 'update') {
        console.log('Extension updated');
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
                enableBuildStatus: data.enableBuildStatus || false,
                tableData: data.tableData || []
            };
            
            const defaultToken = {
                adoPatToken: data.adoPatToken || ''
            };

            console.log('Saving default settings to storage:', defaultSettings);
            
            // Save default token to local storage
            chrome.storage.local.set(defaultToken, () => {
                // Save default settings to Chrome storage
                chrome.storage.sync.set(defaultSettings, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving default settings:', chrome.runtime.lastError);
                    } else {
                        console.log('Default settings saved successfully to storage');
                    }
                });
            });
        })
        .catch(error => {
            console.error('Error loading default data:', error);
        });
}
