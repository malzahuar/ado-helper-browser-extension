// Sends an Entra ID auth request to the background service worker, which is
// the only place in the extension that ever holds a live token.
function sendAuthMessage(type, clientId) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, clientId }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.error) {
                reject(new Error(response.error));
            } else {
                resolve(response);
            }
        });
    });
}

function getCurrentClientId() {
    return document.getElementById('ado-client-id').value.trim();
}

// Load saved options when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize authentication UI
    initializeAuthenticationUI();
    
    chrome.storage.sync.get([
        'issueTag', 
        'userStoryTag', 
        'formatSeparator', 
        'branchHotfixVersion', 
        'tableData',
        'adoOrganization',
        'adoProject',
        'adoClientId',
        'authMethod'
    ], (syncResult) => {
        chrome.storage.local.get(['adoPatToken'], (localResult) => {
            const result = syncResult;
            console.log('Loading settings from storage');
            
            // Load from storage
            if (result.issueTag) {
                document.getElementById('issue-tag').value = result.issueTag;
            }
            if (result.userStoryTag) {
                document.getElementById('user-story-tag').value = result.userStoryTag;
            }
            if (result.formatSeparator) {
                document.getElementById('format-separator').value = result.formatSeparator;
            }
            if (result.branchHotfixVersion) {
                document.getElementById('branch-hotfix-version').value = result.branchHotfixVersion;
            }
            
            // Load Azure DevOps API settings
            if (result.adoOrganization) {
                document.getElementById('ado-organization').value = result.adoOrganization;
            }
            if (result.adoProject) {
                document.getElementById('ado-project').value = result.adoProject;
            }
            if (result.adoClientId) {
                document.getElementById('ado-client-id').value = result.adoClientId.trim();
            }
            
            // Load authentication method (default to OAuth if not set)
            const authMethod = result.authMethod || (localResult.adoPatToken ? 'pat' : 'oauth');
            document.getElementById('auth-' + authMethod).checked = true;
            updateAuthenticationUI();

            // Never echo the stored PAT into the DOM. Show a masked indicator
            // instead; the input is only used when the user is entering a new value.
            showPatStoredState(Boolean(localResult.adoPatToken), localResult.adoPatToken);
            
            // Refresh authentication status display if client ID is set
            if (result.adoClientId) {
                updateAuthenticationStatus();
            }
            
            // Load table data
            if (result.tableData && result.tableData.length > 0) {
                console.log('Loading table data from storage:', result.tableData);
                loadTableData(result.tableData);
            } else {
                console.log('No table data in storage, adding empty row');
                addRow();
            }
        });
    });

    // Add event listener for the "Add Row" button
    document.querySelector('.add-row-btn').addEventListener('click', () => {
        addRow();
    });

    // Add event listener for the "Load Default Rules" button
    document.querySelector('.load-defaults-btn').addEventListener('click', () => {
        loadDefaultData();
    });
});

// Initialize authentication UI with event listeners
function initializeAuthenticationUI() {
    // Generate and display redirect URI
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
    const redirectUriField = document.getElementById('redirect-uri');
    if (redirectUriField) {
        redirectUriField.value = redirectUri;
    }
    
    // Copy redirect URI button
    const copyBtn = document.getElementById('copy-redirect-uri-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const redirectUriField = document.getElementById('redirect-uri');
            redirectUriField.select();
            document.execCommand('copy');
            showToast('Redirect URI copied to clipboard!');
        });
    }
    
    // Auth method radio buttons
    const authRadios = document.querySelectorAll('input[name="auth-method"]');
    authRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            updateAuthenticationUI();
        });
    });
    
    // OAuth buttons
    const loginBtn = document.getElementById('oauth-login-btn');
    const logoutBtn = document.getElementById('oauth-logout-btn');
    const loadDefaultBtn = document.getElementById('load-default-client-id-btn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleOAuthLogin();
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleOAuthLogout();
        });
    }
    
    // Load default OAuth Client ID button
    if (loadDefaultBtn) {
        loadDefaultBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loadDefaultClientId();
        });
    }
}

/**
 * Toggle between "PAT already stored" indicator and the input field.
 * @param {boolean} hasStored - whether a PAT exists in chrome.storage.local
 * @param {string} [token] - the raw token, used only to derive the masked suffix
 */
function showPatStoredState(hasStored, token) {
    const input = document.getElementById('ado-pat-token');
    const storedRow = document.getElementById('ado-pat-stored');
    const storedText = document.getElementById('ado-pat-stored-text');
    const replaceBtn = document.getElementById('ado-pat-replace-btn');
    if (!input || !storedRow || !storedText || !replaceBtn) return;

    if (hasStored) {
        const suffix = token ? token.slice(-4) : '••••';
        storedText.textContent = `✓ PAT saved (••••${suffix})`;
        storedRow.style.display = 'flex';
        input.value = '';
        input.style.display = 'none';
        replaceBtn.onclick = () => {
            storedRow.style.display = 'none';
            input.style.display = 'block';
            input.focus();
        };
    } else {
        storedRow.style.display = 'none';
        input.style.display = 'block';
    }
}

// Update authentication UI based on selected method
function updateAuthenticationUI() {
    const selectedMethod = document.querySelector('input[name="auth-method"]:checked').value;
    const oauthSection = document.getElementById('oauth-section');
    const patSection = document.getElementById('pat-section');
    
    if (selectedMethod === 'oauth') {
        oauthSection.style.display = 'block';
        patSection.style.display = 'none';
    } else {
        oauthSection.style.display = 'none';
        patSection.style.display = 'block';
    }
}

// Handle OAuth login
async function handleOAuthLogin() {
    try {
        const currentClientId = getCurrentClientId();
        if (!currentClientId) {
            showToast('OAuth not configured. Please add your Client ID in settings.', 'error');
            return;
        }

        // Client IDs for Entra app registrations are GUIDs.
        const clientIdGuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        if (!clientIdGuidRegex.test(currentClientId)) {
            showToast('Invalid Client ID format. Expected GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).', 'error');
            return;
        }

        const loginBtn = document.getElementById('oauth-login-btn');
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';

        await sendAuthMessage('ADO_HELPER_AUTH_LOGIN', currentClientId);
        console.log('OAuth login successful');

        // Update UI
        await updateAuthenticationStatus();
        showToast('Successfully signed in!');

    } catch (error) {
        console.error('OAuth login error:', error);
        showToast('Sign in failed: ' + error.message, 'error');
    } finally {
        const loginBtn = document.getElementById('oauth-login-btn');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In with Microsoft';
    }
}

// Handle OAuth logout
async function handleOAuthLogout() {
    try {
        const currentClientId = getCurrentClientId();
        if (!currentClientId) return;

        const logoutBtn = document.getElementById('oauth-logout-btn');
        logoutBtn.disabled = true;
        logoutBtn.textContent = 'Signing out...';

        await sendAuthMessage('ADO_HELPER_AUTH_LOGOUT', currentClientId);
        console.log('OAuth logout successful');

        // Update UI
        await updateAuthenticationStatus();
        showToast('Successfully signed out!');

    } catch (error) {
        console.error('OAuth logout error:', error);
        showToast('Sign out failed: ' + error.message, 'error');
    } finally {
        const logoutBtn = document.getElementById('oauth-logout-btn');
        logoutBtn.disabled = false;
        logoutBtn.textContent = 'Sign Out';
    }
}

// Update authentication status display
async function updateAuthenticationStatus() {
    const currentClientId = getCurrentClientId();
    if (!currentClientId) return;

    let isAuthenticated = false;
    try {
        const response = await sendAuthMessage('ADO_HELPER_AUTH_IS_AUTHENTICATED', currentClientId);
        isAuthenticated = Boolean(response?.isAuthenticated);
    } catch (error) {
        console.error('Error checking authentication status:', error);
    }

    const authStatus = document.getElementById('auth-status');
    const authStatusText = document.getElementById('auth-status-text');
    const loginBtn = document.getElementById('oauth-login-btn');
    const logoutBtn = document.getElementById('oauth-logout-btn');
    
    if (isAuthenticated) {
        authStatus.style.display = 'block';
        authStatus.style.background = 'rgba(16, 124, 16, 0.1)';
        authStatusText.style.color = 'var(--success-color)';
        authStatusText.textContent = '✓ Signed in with Microsoft Entra ID';
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
    } else {
        authStatus.style.display = 'block';
        authStatus.style.background = 'rgba(212, 52, 56, 0.1)';
        authStatusText.style.color = 'var(--danger-color)';
        authStatusText.textContent = '✗ Not signed in';
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
    }
}

// Load default OAuth Client ID from defaultData.json
function loadDefaultClientId() {
    fetch(chrome.runtime.getURL('src/defaultData.json'))
        .then(response => response.json())
        .then(data => {
            if (data.adoClientId) {
                document.getElementById('ado-client-id').value = data.adoClientId;
                showToast('Default OAuth Client ID loaded!');
            } else {
                showToast('Default Client ID not found', 'error');
            }
        })
        .catch(error => {
            console.error('Error loading default Client ID:', error);
            showToast('Failed to load default Client ID', 'error');
        });
}

// Function to add a new row to the table
function addRow(col1 = '', col2 = '') {
    const tableBody = document.getElementById('table-body');
    const newRow = document.createElement('tr');
    
    // Create first cell
    const td1 = document.createElement('td');
    const div1 = document.createElement('div');
    div1.className = 'predefined-blocks';
    const span1 = document.createElement('span');
    span1.className = 'predefined-block';
    span1.setAttribute('data-value', '{hotfixVersion}');
    span1.textContent = '{hotfixVersion}';
    div1.appendChild(span1);
    
    const input1 = document.createElement('input');
    input1.type = 'text';
    input1.className = 'col1';
    input1.placeholder = 'Enter value';
    input1.value = col1;
    
    td1.appendChild(div1);
    td1.appendChild(input1);
    
    // Create second cell
    const td2 = document.createElement('td');
    const div2 = document.createElement('div');
    div2.className = 'predefined-blocks';
    
    ['{workTypeTag}', '{workItemId}', '{title}', '{hotfixVersion}'].forEach(tag => {
        const span = document.createElement('span');
        span.className = 'predefined-block';
        span.setAttribute('data-value', tag);
        span.textContent = tag;
        div2.appendChild(span);
    });
    
    const input2 = document.createElement('input');
    input2.type = 'text';
    input2.className = 'col2';
    input2.placeholder = 'Enter value';
    input2.value = col2;
    
    td2.appendChild(div2);
    td2.appendChild(input2);
    
    // Create third cell (example)
    const td3 = document.createElement('td');
    const div3 = document.createElement('div');
    div3.className = 'result-example col3';
    td3.appendChild(div3);
    
    // Create fourth cell (delete button)
    const td4 = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    td4.appendChild(deleteBtn);
    
    // Append cells to row
    newRow.appendChild(td1);
    newRow.appendChild(td2);
    newRow.appendChild(td3);
    newRow.appendChild(td4);
    
    tableBody.appendChild(newRow);
    
    // Add event listener to the delete button
    deleteBtn.addEventListener('click', function() {
        deleteRow(this);
    });
    
    // Add event listeners to the predefined blocks in this row
    // const col1Blocks = newRow.querySelector('td:nth-child(1) .predefined-blocks'); // No longer needed as we have references
    // const col2Blocks = newRow.querySelector('td:nth-child(2) .predefined-blocks'); // No longer needed
    const col2Input = input2;
    const col1Input = input1;
    const col3Example = div3;
    
    // Function to update the example in column 3
    function updateExample() {
        const formatValue = col2Input.value;
        
        // Generate example by replacing placeholders with sample values
        if (formatValue) {
            const example = formatValue
                .replace(/{workTypeTag}/g, 'feature')
                .replace(/{workItemId}/g, '12345')
                .replace(/{title}/g, 'add-new-feature')
                .replace(/{hotfixVersion}/g, '13.35');
        
            col3Example.textContent = example;
        }
    }
    
    // Update example when inputs change
    col1Input.addEventListener('input', updateExample);
    col2Input.addEventListener('input', updateExample);
    
    // Initial update
    updateExample();
    
    // Add event listeners for col1 predefined blocks
    const col1PredefinedBlocks = div1.querySelectorAll('.predefined-block');
    col1PredefinedBlocks.forEach(block => {
        block.addEventListener('click', function() {
            const value = this.getAttribute('data-value');
            
            // Insert the value at cursor position or append
            const start = col1Input.selectionStart || 0;
            const end = col1Input.selectionEnd || 0;
            const currentValue = col1Input.value;
            
            col1Input.value = currentValue.substring(0, start) + value + currentValue.substring(end);
            
            // Set cursor position after inserted text
            const newCursorPos = start + value.length;
            col1Input.setSelectionRange(newCursorPos, newCursorPos);
            col1Input.focus();
            
            // Update example after inserting value
            updateExample();
        });
    });
    
    // Add event listeners for col2 predefined blocks
    const col2PredefinedBlocks = div2.querySelectorAll('.predefined-block');
    col2PredefinedBlocks.forEach(block => {
        block.addEventListener('click', function() {
            const value = this.getAttribute('data-value');
            
            // Insert the value at cursor position or append
            const start = col2Input.selectionStart || 0;
            const end = col2Input.selectionEnd || 0;
            const currentValue = col2Input.value;
            
            col2Input.value = currentValue.substring(0, start) + value + currentValue.substring(end);
            
            // Set cursor position after inserted text
            const newCursorPos = start + value.length;
            col2Input.setSelectionRange(newCursorPos, newCursorPos);
            col2Input.focus();
            
            // Update example after inserting value
            updateExample();
        });
    });
}

// Function to delete a row
function deleteRow(button) {
    const row = button.parentElement.parentElement;
    row.remove();
}

// Function to load table data from storage
function loadTableData(data) {
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = ''; // Clear existing rows
    data.forEach(row => {
        addRow(row.col1, row.col2);
    });
}
function loadFieldsFromDefaults(data) {
    if (data.issueTag) {
        document.getElementById('issue-tag').value = data.issueTag;
    }
    if (data.userStoryTag) {
        document.getElementById('user-story-tag').value = data.userStoryTag;
    }
    if (data.formatSeparator) {
        document.getElementById('format-separator').value = data.formatSeparator;
    }
    if (data.branchHotfixVersion) {
        document.getElementById('branch-hotfix-version').value = data.branchHotfixVersion;
    }
}

// Function to get table data
function getTableData() {
    const tableBody = document.getElementById('table-body');
    const rows = tableBody.querySelectorAll('tr');
    const data = [];
    
    rows.forEach(row => {
        const col1Input = row.querySelector('.col1');
        const col2Input = row.querySelector('.col2');
        
        if (col1Input && col2Input) {
            const col1 = col1Input.value;
            const col2 = col2Input.value;
            
            // Only save rows that have at least one non-empty value
            if (col1 || col2) {
                data.push({ col1, col2 });
            }
        }
    });
    
    console.log('Getting table data:', data);
    return data;
}


// Function to show toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// Save settings function
function saveSettings() {
    const tableData = getTableData();
    const authMethod = document.querySelector('input[name="auth-method"]:checked').value;
    const patInput = document.getElementById('ado-pat-token');
    const adoPatToken = patInput.value;
    const patInputVisible = patInput.style.display !== 'none';
    const adoClientId = document.getElementById('ado-client-id').value.trim();

    const settings = {
        issueTag: document.getElementById('issue-tag').value,
        userStoryTag: document.getElementById('user-story-tag').value,
        formatSeparator: document.getElementById('format-separator').value,
        branchHotfixVersion: document.getElementById('branch-hotfix-version').value,
        tableData: tableData,
        adoOrganization: document.getElementById('ado-organization').value,
        adoProject: document.getElementById('ado-project').value,
        authMethod: authMethod,
        adoClientId: adoClientId
    };

    console.log('Saving settings with auth method:', authMethod);

    const finalize = () => {
        if (adoClientId) {
            updateAuthenticationStatus();
        }
        // Clear the input so the secret never lingers in the DOM, and refresh
        // the masked indicator from storage.
        patInput.value = '';
        chrome.storage.local.get(['adoPatToken'], (r) => {
            showPatStoredState(Boolean(r.adoPatToken), r.adoPatToken);
        });
        showToast('Options saved!');
    };

    chrome.storage.sync.set(settings, () => {
        if (authMethod === 'pat' && patInputVisible && adoPatToken) {
            // User entered a new PAT — persist it.
            chrome.storage.local.set({ adoPatToken }, () => {
                if (chrome.runtime.lastError) {
                    showToast('Error saving PAT token: ' + chrome.runtime.lastError.message, 'error');
                    return;
                }
                finalize();
            });
        } else if (authMethod === 'oauth') {
            // Switched away from PAT — clear the stored secret.
            chrome.storage.local.remove('adoPatToken', finalize);
        } else {
            // PAT mode but input was hidden (keeping existing stored value) — leave it alone.
            finalize();
        }
    });
}

// Save options when the form is submitted
document.getElementById('options-form').addEventListener('submit', (event) => {
    event.preventDefault();
    saveSettings();
});

// Function to load default rules from JSON
function loadDefaultData() {
    if (confirm('This will replace all current rules with default rules. Continue?')) {
        fetch(chrome.runtime.getURL('src/defaultData.json'))
            .then(response => response.json())
            .then(data => {
                if (data.tableData && data.tableData.length > 0) {
                    // Clear existing table
                    const tableBody = document.getElementById('table-body');
                    tableBody.innerHTML = '';
                    // Load default data
                    loadTableData(data.tableData);
                    loadFieldsFromDefaults(data);
                    showToast('Default rules loaded successfully!');
                } else {
                    showToast('No default data found.', 'error');
                }
            })
            .catch(error => {
                console.error('Error loading default data:', error);
                showToast('Error loading default rules. Please try again.', 'error');
            });
    }
}
