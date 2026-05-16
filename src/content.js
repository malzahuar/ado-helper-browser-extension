// Global variable to store settings
let extensionSettings = {};
let lastUrl = window.location.href;
let cachedApi = null; // Cache the API instance

const BOARD_STATUS_PAGE_PATHS = ['/_boards/board/', '/_sprints/taskboard/'];
const BOARD_WRAPPER_SELECTORS = [
    '.board-wrapper.page-content-top.flex-column.flex-grow',
    '.vss-Splitter--container.vss-Splitter--container-row'
];
const BOARD_CARD_SELECTORS = [
    '.card-content'
];
const PRIMARY_BOARD_CARD_SELECTOR = '.boards-card, .taskboard-card, .taskboard-work-item-card';

let boardMutationObserver = null;
let authNotificationShownAt = 0;

function isBoardStatusPage(url = window.location.href) {
    return BOARD_STATUS_PAGE_PATHS.some(path => url.includes(path));
}

function getBoardWrapperElement() {
    for (const selector of BOARD_WRAPPER_SELECTORS) {
        const wrapper = document.querySelector(selector);
        if (wrapper) {
            return wrapper;
        }
    }
    return null;
}

function extractWorkItemIdFromElement(element) {
    if (!element) return null;

    const idCandidates = [
        element.querySelector('.selectable-text')?.textContent,
        element.getAttribute('data-id'),
        element.getAttribute('data-work-item-id'),
        element.getAttribute('data-workitemid'),
        element.querySelector('[data-id]')?.getAttribute('data-id'),
        element.querySelector('[data-work-item-id]')?.getAttribute('data-work-item-id'),
        element.querySelector('.id')?.textContent
    ];

    const workItemLink = element.querySelector('a[href*="/_workitems/edit/"]');
    if (workItemLink) {
        const hrefMatch = workItemLink.getAttribute('href')?.match(/\/_workitems\/edit\/(\d+)/);
        if (hrefMatch?.[1]) {
            idCandidates.push(hrefMatch[1]);
        }
    }

    for (const candidate of idCandidates) {
        const numericMatch = candidate?.trim().match(/\d+/);
        if (!numericMatch) continue;

        const parsedId = Number.parseInt(numericMatch[0], 10);
        if (Number.isInteger(parsedId) && parsedId > 0) {
            return parsedId;
        }
    }

    return null;
}

function getTicketCardsFromNode(node) {
    if (!(node instanceof Element)) return [];

    const discoveredCards = [];
    const selector = BOARD_CARD_SELECTORS.join(', ');
    if (node.matches(selector)) {
        discoveredCards.push(node);
    }
    discoveredCards.push(...node.querySelectorAll(selector));

    return discoveredCards;
}

function getCardContainerElement(element) {
    if (!(element instanceof Element)) return null;
    return element.closest(PRIMARY_BOARD_CARD_SELECTOR) || element;
}

// Function to show toast notification
function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '15px 20px';
    toast.style.borderRadius = '4px';
    toast.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    toast.style.zIndex = '10000';
    toast.style.fontSize = '14px';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease-in-out';
    toast.textContent = message;
    
    // Set background color based on type
    if (type === 'error') {
        toast.style.color = '#b05765';
        toast.style.backgroundColor = '#fdf2f2';
    } else {
        toast.style.color = '#ffffff';
        toast.style.backgroundColor = '#5e87e4';
    }

    const newBranchDialog = document.querySelector('[aria-labelledby="__bolt-create-version-dialog"]');
    if (!newBranchDialog) {
        console.error('New branch dialog not found. Cannot show notification.');
        return;
    }
    newBranchDialog.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '1';
    }, 100);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            newBranchDialog.removeChild(toast);
        }, 300);
    }, 3000);
}

/**
 * Page-level toast that does NOT depend on the new-branch dialog being open.
 * Attaches to document.body so it works on the board view, work-item view, etc.
 * Uses position: fixed so it's visible regardless of scroll position.
 */
function showGlobalNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '4px';
    toast.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.15)';
    toast.style.zIndex = '2147483647';
    toast.style.fontSize = '14px';
    toast.style.maxWidth = '420px';
    toast.style.textAlign = 'center';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.6s ease-in-out';
    toast.textContent = message;

    if (type === 'error') {
        toast.style.color = '#b05765';
        toast.style.backgroundColor = '#fdf2f2';
        toast.style.border = '1px solid #f5c2c7';
    } else {
        toast.style.color = '#ffffff';
        toast.style.backgroundColor = '#5e87e4';
    }

    document.body.appendChild(toast);

    requestAnimationFrame(() => { toast.style.opacity = '1'; });

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 600);
    }, 8000);
}

function showAuthNotification(error) {
    const now = Date.now();
    const throttleMs = 15000;
    if (now - authNotificationShownAt < throttleMs) {
        return;
    }

    authNotificationShownAt = now;
    const friendlyMessage = OAuth.getUserFacingAuthMessage(error);
    showGlobalNotification(`ADO Helper: ${friendlyMessage}`, 'error');
}

/**
 * Get or create cached API instance
 * Reuses the same API instance to avoid recreating OAuth objects
 */
async function getApiInstance(organization, project, clientId, patToken) {
    // If we have a cached instance and settings haven't changed, reuse it
    if (cachedApi && 
        cachedApi.organization === organization && 
        cachedApi.project === project) {
        return cachedApi;
    }
    
    // Create new API instance and cache it
    cachedApi = await AzureDevOpsAPI.createWithStoredAuth(
        organization,
        project,
        clientId,
        patToken
    );
    
    return cachedApi;
}

/**
 * Clear API cache (call when settings change)
 */
function clearApiCache() {
    cachedApi = null;
}

// Load settings when the content script is initialized
function loadSettings() {
    // Use Chrome storage API to load all settings
    chrome.storage.sync.get([
        'issueTag', 'userStoryTag', 'formatSeparator', 'branchHotfixVersion', 'tableData',
        'adoOrganization', 'adoProject', 'authMethod', 'adoClientId'
    ], function(syncResult) {
        chrome.storage.local.get(['adoPatToken'], async function(localResult) {
            // Merge results
            const result = { 
                ...syncResult, 
                adoPatToken: localResult.adoPatToken 
            };

            extensionSettings = {
                issueTag: result.issueTag,
                userStoryTag: result.userStoryTag,
                formatSeparator: result.formatSeparator,
                branchHotfixVersion: result.branchHotfixVersion,
                tableData: result.tableData,
                adoOrganization: result.adoOrganization,
                adoProject: result.adoProject,
                adoPatToken: result.adoPatToken,
                authMethod: result.authMethod || 'oauth'
            };
            
            // Create a safe copy for logging
            const safeSettings = { ...extensionSettings };
            if (safeSettings.adoPatToken) safeSettings.adoPatToken = '***';
            console.log('Settings loaded:', safeSettings);
            
            // Clear cache when settings change to ensure fresh API instance
            clearApiCache();
            
            try {
                // Pre-cache the API instance for later use
                if (result.adoOrganization && result.adoProject) {
                    await getApiInstance(
                        result.adoOrganization,
                        result.adoProject,
                        result.adoClientId,
                        result.adoPatToken
                    );
                    console.log('API instance cached and ready');
                }
            } catch (error) {
                console.error('Error caching API instance:', error);
            }
        });
    });
}

// Save settings to Chrome storage
function saveSettings(newSettings) {
    // Merge new settings with existing ones
    extensionSettings = { ...extensionSettings, ...newSettings };
    
    chrome.storage.sync.set({ extensionSettings: extensionSettings }, function() {
        if (chrome.runtime.lastError) {
            console.error('Failed to save settings:', chrome.runtime.lastError);
        } else {
            console.log('Settings saved successfully:', extensionSettings);
        }
    });
}

// Wait for the DOM to load before adding the listener
window.addEventListener('load', () => {
    console.log('Window loaded in content script');
    addCreateBranchDialogListener();
    
    // Call loadSettings when the script is loaded
    loadSettings();
    
    // Initialize board build status if on a supported board/taskboard page
    if (isBoardStatusPage()) {
        initializeBoardBuildStatus();
    }

    // Check for URL changes (SPA navigation)
    setInterval(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            console.log('URL changed to:', lastUrl);
            
            // Re-initialize listeners
            addCreateBranchDialogListener();
            
            if (isBoardStatusPage()) {
                initializeBoardBuildStatus();
            }
        }
    }, 1000);
});

//region BranchName generation
function getBranchName() {
    const workItemHdr = document.getElementsByClassName('work-item-form-page')[0];
    if (!workItemHdr) {
        console.error('Work item header not found');
        return '';
    }
    
    const ticketNumberElement = workItemHdr.getElementsByClassName('body-xl')[0];
    const ticketNumber = ticketNumberElement?.innerText || '';
    
    const ticketTypeElement = workItemHdr.getElementsByClassName('fluent-icons-enabled')[0];
    const ticketType = ticketTypeElement?.getAttribute('aria-label') || '';
    
    const ticketTitleElement = document.querySelector('[aria-label="Title field"]');
    const ticketTitle = ticketTitleElement instanceof HTMLInputElement ? ticketTitleElement.value : '';
    
    const ticketBaseHdr = document.getElementsByClassName('version-dropdown')[0];
    const ticketBaseBranchInput = ticketBaseHdr?.querySelector('[id^="__bolt-textfield-input-"]');
    const ticketBaseBranch = ticketBaseBranchInput?.value || '';

    const branchName = generateBranchName(ticketNumber, ticketTitle, ticketType, ticketBaseBranch);
    console.log('Branch Name:', branchName);

    return branchName;
}

function generateBranchName(ticketNumber, ticketTitle, ticketType, ticketBaseBranch) {
    // Format the ticket title to be URL-friendly
    const formatSeparator = extensionSettings.formatSeparator;
    const formattedTitle = ticketTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, formatSeparator) // Replace non-alphanumeric characters with separator
        .replace(new RegExp(`^${formatSeparator}|${formatSeparator}$`, 'g'), ''); // Remove leading and trailing separators

    // Get workTypeTag based on ticket type
    const issueTag = extensionSettings.issueTag;
    const userStoryTag = extensionSettings.userStoryTag;
    const workTypeIssue = 'issue';
    const workTypeUserStory = 'user story';
    let workTypeTag = '';
    if (ticketType.toLowerCase() === workTypeIssue) {
        workTypeTag = issueTag;
    } else if (ticketType.toLowerCase() === workTypeUserStory) {
        workTypeTag = userStoryTag;
    }

    const regexBaseHotfixVersion = "(?:(\\d+)(?:.(\\d)){0,1}(?:.(\\d)){0,1}(?:.(\\d)){0,1}.{0,1})";
    const rules = extensionSettings.tableData || [];
    let matchingRule = null;
    let hotfixVersion = '';
    const hotfixVersionTag = '{hotfixVersion}';
    
    for (const rule of rules) {
        const baseBranchFilter = rule.col1;
        
        if (baseBranchFilter.includes(hotfixVersionTag)) {
            const pattern = baseBranchFilter.replace(hotfixVersionTag, regexBaseHotfixVersion);
            const regex = new RegExp(pattern, 'g');
            const matches = Array.from(ticketBaseBranch.matchAll(regex));
            
            if (matches.length > 0) {
                matchingRule = rule;
                const newBranchHotfixVersion = extensionSettings.branchHotfixVersion || '{major}{minor}';
                const versionParts = Array.from(newBranchHotfixVersion.matchAll(/({\w+})/g));
                
                // Build hotfix version from captured groups
                const versionNumbers = [];
                for (let i = 0; i < versionParts.length && i < matches[0].length - 1; i++) {
                    const versionNumber = matches[0][i + 1];
                    if (versionNumber !== undefined) {
                        versionNumbers.push(versionNumber);
                    }
                }
                hotfixVersion = versionNumbers.join(formatSeparator);
                break;
            }
        } else if (ticketBaseBranch.includes(baseBranchFilter) || baseBranchFilter === ticketBaseBranch) {
            matchingRule = rule;
            break;
        }
    }

    // Generate branch name using the matching rule or default format
    let branchName = '';
    if (matchingRule) {
        // Use the format from the matching rule
        branchName = matchingRule.col2
            .replace(/{workTypeTag}/g, workTypeTag)
            .replace(/{workItemId}/g, ticketNumber)
            .replace(/{title}/g, formattedTitle)
            .replace(/{hotfixVersion}/g, hotfixVersion);
    } else {
        // Fallback to default format
        showNotification(`ADO Helper: No rule found for base branch: ${ticketBaseBranch}. Using default format.`, 'error');
        branchName = `${ticketNumber}${formatSeparator}${formattedTitle}`;
        if (workTypeTag) {
            branchName = `${workTypeTag}/${branchName}`;
        }
    }

    return branchName;
}
//endregion BranchName generation

function getInputField() {
    // Select the input field where you want to add the icon
    const newBranchDialog = document.querySelector('[aria-labelledby="__bolt-create-version-dialog"]');
    if (!newBranchDialog) {
        console.log('New branch dialog not found.');
        return null;
    }

    const inputField = newBranchDialog.querySelector('[id^="__bolt-textfield-input-"]');
    if (inputField === null) {
        console.log('Input field not found in the new branch dialog.');
    }
    return inputField;
}

function findNode (idValue, array) {
    if (array.length === 0) return null; // Return null if the array is empty
    for (const node in array) {
      if (node.id === idValue) return node;
      if (node.children) {
        const child = findNode(idValue, node.children);
        if (child) return child;
      }
    }
  }

function handleFocusDialog(mutation) {
    const dialogNode = Array.from(mutation.addedNodes).find(node => 
        node.className && node.className.includes('bolt-portal absolute-fill')
    );
    if (!dialogNode) {
        console.log('No dialog node found:', mutation.addedNodes);
        return;
    }
    
    const inputField = getInputField();
    if (!inputField || !inputField.parentElement) {
        return;
    }

    const iconNodeId = 'branch-gen-icon';
    const iconExists = findNode(iconNodeId, mutation.addedNodes) || document.getElementById(iconNodeId);
    if (!iconExists) {
        const icon = document.createElement('span');
        icon.id = iconNodeId;
        icon.innerHTML = '✨';
        icon.style.cursor = 'pointer';
        icon.style.marginLeft = '5px';
        inputField.parentElement.appendChild(icon);
        icon.addEventListener('click', () => {
            const brname = getBranchName();
            inputField.value = brname;
            // Dispatch an 'input' event to simulate user typing
            const inputEvent = new Event('input', {
                bubbles: true, // Allow the event to bubble up
                cancelable: true, // Allow the event to be canceled
            });
            inputField.dispatchEvent(inputEvent);

            // Dispatch a 'change' event to ensure the value is stored
            const changeEvent = new Event('change', {
                bubbles: true,
                cancelable: true,
            });
            inputField.dispatchEvent(changeEvent);
        });
    }
}

function addCreateBranchDialogListener() {
    const container = document.getElementsByClassName('bolt-portal-host absolute-fill no-events scroll-hidden')[0];
    if (container) {
        // Create an observer instance
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                handleFocusDialog(mutation);
            });
        });

        // Configuration of the observer
        var config = { childList: true, subtree: false };

        // Pass in the target node, as well as the observer options
        observer.observe(container, config);
        console.log('Listener added');
    } else {
        console.error('Dialog not found on the webpage.');
    }
}

// Wait for board to load
function getBoardTickets() {
    const boardWrapper = getBoardWrapperElement();
    if (!boardWrapper) {
        console.log('Board wrapper not found');
        return [];
    }

    const tickets = boardWrapper.querySelectorAll(BOARD_CARD_SELECTORS.join(', '));

    const ticketList = [];
    const seenIds = new Set();
    const seenElements = new Set();
    tickets.forEach(ticket => {
        const cardElement = getCardContainerElement(ticket);
        const workItemId = extractWorkItemIdFromElement(cardElement);
        
        if (workItemId && cardElement && !seenIds.has(workItemId) && !seenElements.has(cardElement)) {
            seenIds.add(workItemId);
            seenElements.add(cardElement);
            ticketList.push({
                id: workItemId,
                element: cardElement
            });
        }
    });

    return ticketList;
}

// Add build status icon to a ticket card
function addIconToTicket(ticketElement, workItemId, emoji, color, title, type = 'branch') {
    if (!ticketElement || !ticketElement.querySelector) return;

    // Check if icon already exists
    const iconClass = `build-status-icon-${type}`;
    const existingIcon = ticketElement.querySelector(`.${iconClass}`);
    if (existingIcon) {
        // Update existing icon
        existingIcon.textContent = emoji;
        existingIcon.style.color = color;
        existingIcon.title = title;
        return;
    }

    // Create new icon
    const icon = document.createElement('span');
    icon.className = iconClass;
    icon.classList.add('ado-helper-status-icon'); // Add a common class for counting
    icon.textContent = emoji;
    icon.style.position = 'absolute';
    icon.style.bottom = '4px';
    icon.style.fontSize = '16px';
    icon.style.color = color;
    icon.style.cursor = 'help';
    icon.style.zIndex = '10';
    icon.title = title;
    
    // Make sure parent has relative positioning
    ticketElement.style.position = 'relative';

     // Calculate position based on existing icons
    const existingIcons = ticketElement.querySelectorAll('.ado-helper-status-icon');
    const iconCount = existingIcons.length;
    
    // Base right position is 4px. Each subsequent icon moves left by 20px.
    // This stacks them from right to left: 4px, 24px, 44px, etc.
    const rightPosition = 4 + (iconCount * 20);
    icon.style.right = `${rightPosition}px`;

    ticketElement.appendChild(icon);
}

// Initialize board build status functionality
async function initializeBoardBuildStatus() {
    console.log('Initializing board build status...');
    
    // Poll for the board wrapper to ensure it's loaded
    let attempts = 0;
    const maxAttempts = 20; // Try for 10 seconds
    
    const checkBoardInterval = setInterval(async () => {
        attempts++;
        const boardWrapper = getBoardWrapperElement();
        
        if (boardWrapper) {
            clearInterval(checkBoardInterval);
            console.log('Board wrapper found, proceeding with initialization');

            const settings = await new Promise((resolve) => {
                chrome.storage.sync.get(['adoOrganization', 'adoProject', 'authMethod', 'adoClientId'], (syncResult) => {
                    chrome.storage.local.get(['adoPatToken'], (localResult) => {
                        resolve({ ...syncResult, adoPatToken: localResult.adoPatToken });
                    });
                });
            });
    
            if (!settings.adoOrganization || !settings.adoProject) {
                console.log('Azure DevOps API not fully configured');
                return;
            }
    
            try {
                // Get cached API instance
                const api = await getApiInstance(
                    settings.adoOrganization,
                    settings.adoProject,
                    settings.adoClientId,
                    settings.adoPatToken
                );
    
                // Get all tickets on the board
                const tickets = getBoardTickets();
                console.log(`Found ${tickets.length} tickets on board`);
    
                if (tickets.length > 0) {
                    // Collect IDs
                    const ticketIds = tickets.map(t => t.id);
                    
                    // Fetch statuses in batch
                    try {
                        const statuses = await api.getWorkItemsStatuses(ticketIds);
                        
                        // Update UI
                        for (const ticket of tickets) {
                            const status = statuses[ticket.id];
                            if (status) {
                                const { branchStatus, prStatus } = status;
            
                                // PR Status
                                const prIcon = AzureDevOpsAPI.getPrStatusIcon(prStatus.overallStatus);
                                addIconToTicket(ticket.element, ticket.id, prIcon.emoji, prIcon.color, 'PRs: '+ prIcon.title, 'pr');
            
                                // Branch Status
                                // Skip if no branches and PRs are completed
                                if (!((branchStatus.overallStatus == 'none') && (prStatus.overallStatus == 'completed'))) {
                                    const branchIcon = AzureDevOpsAPI.getBuildStatusIcon(branchStatus.overallStatus);
                                    addIconToTicket(ticket.element, ticket.id, branchIcon.emoji, branchIcon.color, 'Branches: '+ branchIcon.title, 'branch');
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error fetching batch statuses:', error);
                        if (OAuth.isEntraSessionExpiredError(error)) {
                            throw error;
                        }
                    }
                }

                // Watch for new cards being added (when columns are expanded/collapsed or cards moved)
                observeBoardChanges(api);
            } catch (error) {
                console.error('Error initializing API:', error);
                if (OAuth.isEntraSessionExpiredError(error)) {
                    clearApiCache();
                }
                showAuthNotification(error);
            }

        } else if (attempts >= maxAttempts) {
            clearInterval(checkBoardInterval);
            console.log('Board wrapper not found after waiting');
        }
    }, 500);
}

// Observe board changes and add icons to new cards
function observeBoardChanges(api) {
    const boardWrapper = getBoardWrapperElement();
    if (!boardWrapper) return;

    if (boardMutationObserver) {
        boardMutationObserver.disconnect();
        boardMutationObserver = null;
    }

    let pendingNodes = [];
    let timeout = null;

    const processPendingNodes = async () => {
        if (pendingNodes.length === 0) return;
        
        const nodesToProcess = [...pendingNodes];
        pendingNodes = [];
        
        const ticketIds = nodesToProcess.map(n => n.id);
        try {
            const statuses = await api.getWorkItemsStatuses(ticketIds);
            
            for (const item of nodesToProcess) {
                const status = statuses[item.id];
                if (status) {
                    const { branchStatus, prStatus } = status;

                    // PR Status
                    const prIcon = AzureDevOpsAPI.getPrStatusIcon(prStatus.overallStatus);
                    addIconToTicket(item.node, item.id, prIcon.emoji, prIcon.color, 'PRs: '+ prIcon.title, 'pr');

                    // Branch Status
                    // Skip if no branches and PRs are completed
                    if (!((branchStatus.overallStatus == 'none') && (prStatus.overallStatus == 'completed'))) {
                        const branchIcon = AzureDevOpsAPI.getBuildStatusIcon(branchStatus.overallStatus);
                        addIconToTicket(item.node, item.id, branchIcon.emoji, branchIcon.color, 'Branches: '+ branchIcon.title, 'branch');
                    }
                }
            }
        } catch (error) {
            console.error('Error processing new nodes:', error);
            if (OAuth.isEntraSessionExpiredError(error)) {
                clearApiCache();
            }
            showAuthNotification(error);
        }
    };

    boardMutationObserver = new MutationObserver((mutations) => {
        let hasNewCards = false;
        const seenMutationKeys = new Set();
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                const cards = getTicketCardsFromNode(node);
                for (const card of cards) {
                    const cardElement = getCardContainerElement(card);
                    const workItemId = extractWorkItemIdFromElement(cardElement);
                    if (workItemId) {
                        const mutationKey = `${workItemId}-${cardElement.className}`;
                        if (seenMutationKeys.has(mutationKey)) {
                            continue;
                        }
                        seenMutationKeys.add(mutationKey);
                        pendingNodes.push({
                            id: workItemId,
                            node: cardElement
                        });
                        hasNewCards = true;
                    }
                }
            }
        }

        if (hasNewCards) {
            // Debounce updates to batch them
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(processPendingNodes, 500);
        }
    });

    boardMutationObserver.observe(boardWrapper, {
        childList: true,
        subtree: true
    });

    console.log('Board observer initialized');
}
