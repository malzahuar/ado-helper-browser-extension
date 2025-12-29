// Load saved options when the page loads
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get([
        'issueTag', 
        'userStoryTag', 
        'formatSeparator', 
        'branchHotfixVersion', 
        'tableData',
        'adoOrganization',
        'adoProject',
        'enableBuildStatus'
    ], (syncResult) => {
        chrome.storage.local.get(['adoPatToken'], (localResult) => {
            const result = { ...syncResult, adoPatToken: localResult.adoPatToken };
            
            // Create a safe copy for logging that doesn't include the token
            const safeResult = { ...result };
            if (safeResult.adoPatToken) safeResult.adoPatToken = '***';
            console.log('Loading settings from storage:', safeResult);
            
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
            if (result.adoPatToken) {
                document.getElementById('ado-pat-token').value = result.adoPatToken;
            }
            if (result.enableBuildStatus !== undefined) {
                document.getElementById('enable-build-status').checked = result.enableBuildStatus;
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
    const adoPatToken = document.getElementById('ado-pat-token').value;

    const settings = {
        issueTag: document.getElementById('issue-tag').value,
        userStoryTag: document.getElementById('user-story-tag').value,
        formatSeparator: document.getElementById('format-separator').value,
        branchHotfixVersion: document.getElementById('branch-hotfix-version').value,
        tableData: tableData,
        adoOrganization: document.getElementById('ado-organization').value,
        adoProject: document.getElementById('ado-project').value,
        enableBuildStatus: document.getElementById('enable-build-status').checked
    };

    console.log('Saving settings:', settings);
    
    // Save token to local storage
    chrome.storage.local.set({ adoPatToken }, () => {
        // Save other settings to sync storage
        chrome.storage.sync.set(settings, () => {
            // Remove token from sync storage if it exists (cleanup)
            chrome.storage.sync.remove('adoPatToken');

            if (chrome.runtime.lastError) {
                console.error('Error saving:', chrome.runtime.lastError);
                showToast('Error saving options: ' + chrome.runtime.lastError.message, 'error');
            } else {
                console.log('Settings saved successfully');
                showToast('Options saved!');
            }
        });
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
