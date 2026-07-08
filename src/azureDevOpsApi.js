/**
 * Azure DevOps API Helper
 * Handles API calls to retrieve build status for work items
 */

/**
 * Stands in for a live OAuth instance inside the content script. Delegates
 * every token request to the background service worker instead, so the
 * access/refresh token never has to be read into a context that shares a
 * world with the Azure DevOps page itself.
 */
class RemoteOAuthToken {
    constructor(clientId) {
        this.clientId = clientId;
    }

    getValidToken() {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: 'ADO_HELPER_AUTH_GET_TOKEN', clientId: this.clientId },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response?.error) {
                        reject(new Error(response.error));
                    } else {
                        resolve(response.token);
                    }
                }
            );
        });
    }
}

class AzureDevOpsAPI {
    constructor(organization, project, authToken, isOAuth = false) {
        this.organization = organization;
        this.project = project;
        this.authToken = authToken;
        this.isOAuth = isOAuth;
        this.baseUrl = `https://dev.azure.com/${organization}/${project}/_apis`;
    }

    /**
     * Create API instance with PAT token (legacy)
     * @param {string} organization - Azure DevOps organization
     * @param {string} project - Azure DevOps project
     * @param {string} patToken - PAT token
     * @returns {AzureDevOpsAPI} API instance
     */
    static withPAT(organization, project, patToken) {
        return new AzureDevOpsAPI(organization, project, patToken, false);
    }

    /**
     * Create API instance with OAuth token
     * @param {string} organization - Azure DevOps organization
     * @param {string} project - Azure DevOps project
     * @param {object} oauth - OAuth helper object
     * @returns {Promise<AzureDevOpsAPI>} API instance
     */
    static async createWithOAuth(organization, project, oauth) {
        const token = await oauth.getValidToken();
        const instance = new AzureDevOpsAPI(organization, project, token, true);
        instance.oauth = oauth;
        return instance;
    }

    /**
     * Create API instance using stored authentication method (OAuth or PAT)
     * @param {string} organization - Azure DevOps organization
     * @param {string} project - Azure DevOps project
     * @param {string} clientId - OAuth Client ID (can be undefined if using PAT)
     * @param {string} patToken - PAT token (can be undefined if using OAuth)
     * @returns {Promise<AzureDevOpsAPI>} API instance
     */
    static createWithStoredAuth(organization, project, clientId = null, patToken = null) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get('authMethod', (syncResult) => {
                const authMethod = syncResult.authMethod || 'oauth';
                
                if (authMethod === 'pat' && patToken) {
                    // Use PAT authentication
                    console.log('Using PAT authentication');
                    resolve(new AzureDevOpsAPI(organization, project, patToken, false));
                } else if (authMethod === 'oauth' && clientId) {
                    // Use OAuth authentication
                    console.log(('Using OAuth authentication'));
                    const oauth = new RemoteOAuthToken(clientId);
                    AzureDevOpsAPI.createWithOAuth(organization, project, oauth)
                        .then(instance => resolve(instance))
                        .catch(err => reject(err));
                } else {
                    reject(new Error('No valid authentication method configured'));
                }
            });
        });
    }

    /**
     * Get authentication header based on auth type
     * @returns {Promise<string>} Authorization header value
     */
    async getAuthHeader() {
        if (this.isOAuth) {
            // For OAuth, use Bearer token
            if (this.oauth) {
                const token = await this.oauth.getValidToken();
                return `Bearer ${token}`;
            }
            return `Bearer ${this.authToken}`;
        } else {
            // For PAT, use Basic auth
            const token = btoa(`:${this.authToken}`);
            return `Basic ${token}`;
        }
    }

    /**
     * Detect whether an error is authentication-related.
     * @private
     * @param {Error|string} error - Error object or message
     * @returns {boolean} True if this is likely an auth issue
     */
    isAuthError(error) {
        if (error instanceof AuthError) {
            return true;
        }
        return OAuth.isEntraSessionExpiredError(error);
    }

    /**
     * Throw an AuthError if a response indicates 401/403, otherwise return it.
     * Use this immediately after any authenticated fetch so callers can route
     * auth failures to the re-auth flow instead of swallowing them as "no data".
     * @private
     * @param {Response} response
     * @returns {Response}
     */
    throwIfAuthFailed(response) {
        if (response.status === 401 || response.status === 403) {
            throw new AuthError(
                `Azure DevOps rejected the request (HTTP ${response.status}). Please sign in again.`,
                response.status
            );
        }
        return response;
    }

    /**
     * Get multiple work items with relations
     * @param {Array<number>} ids - Array of work item IDs
     * @returns {Promise<Array>} Array of work items
     */
    async getWorkItems(ids) {
        try {
            // Chunk IDs if too many (ADO limit is usually 200)
            const chunkSize = 200;
            const chunks = [];
            for (let i = 0; i < ids.length; i += chunkSize) {
                chunks.push(ids.slice(i, i + chunkSize));
            }

            const results = [];
            for (const chunk of chunks) {
                const url = `${this.baseUrl}/wit/workitems?ids=${chunk.join(',')}&$expand=relations&api-version=7.0`;
                const authHeader = await this.getAuthHeader();
                const response = await fetch(url, {
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json'
                    }
                });

                this.throwIfAuthFailed(response);

                if (response.ok) {
                    const data = await response.json();
                    results.push(...(data.value || []));
                }
            }
            return results;
        } catch (error) {
            console.error('Error fetching work items batch:', error);
            if (this.isAuthError(error)) {
                throw error;
            }
            return [];
        }
    }

    /**
     * Get build and PR status for multiple work items
     * @param {Array<number>} workItemIds - Array of work item IDs
     * @returns {Promise<Object>} Map of workItemId -> { branchStatus, prStatus }
     */
    async getWorkItemsStatuses(workItemIds) {
        const workItems = await this.getWorkItems(workItemIds);
        const results = {};

        // Process in parallel with concurrency limit
        const processWorkItem = async (workItem) => {
            const branches = this.extractBranchesFromRelations(workItem.relations);
            const prIds = this.extractPRIdsFromRelations(workItem.relations);

            const [branchStatus, prStatus] = await Promise.all([
                this.calculateBranchStatus(workItem.id, branches),
                this.calculatePRStatus(workItem.id, prIds)
            ]);

            results[workItem.id] = { branchStatus, prStatus };
        };

        // Simple parallel execution (for now, assuming browser handles connection limits)
        await Promise.all(workItems.map(processWorkItem));
        
        return results;
    }

    extractBranchesFromRelations(relations) {
        const branches = [];
        if (relations) {
            for (const relation of relations) {
                if (relation.rel === 'ArtifactLink' && relation.url.includes('vstfs:///Git/Ref/')) {
                    const branchUrl = relation.url;
                    const branchName = this.extractBranchName(branchUrl);
                    if (branchName) {
                        branches.push({ name: branchName, url: branchUrl, repoId: this.extractRepoId(branchUrl) });
                    }
                }
            }
        }
        return branches;
    }

    extractPRIdsFromRelations(relations) {
        const prIds = [];
        if (relations) {
            for (const relation of relations) {
                if (relation.rel === 'ArtifactLink' && 
                    relation.url && 
                    relation.url.toLowerCase().includes('/pullrequestid/')) {
                    const prId = this.extractPullRequestId(relation.url);
                    if (prId) prIds.push(prId);
                }
            }
        }
        return prIds;
    }

    async calculateBranchStatus(workItemId, branches) {
        if (branches.length === 0) {
            return { workItemId, hasBuilds: false, branches: [], overallStatus: 'none' };
        }

        const branchStatuses = [];
        let hasAnyFailed = false;
        let hasAnyPartiallySucceeded = false;
        let hasAnyCanceled = false;
        let hasAnyInProgress = false;
        let hasAnySucceeded = false;

        // Process branches in parallel
        await Promise.all(branches.map(async (branch) => {
            let status = 'none';
            const latestBuild = await this.getLatestBuild(branch.name);
            
            if (latestBuild) {
                status = this.normalizeBuildStatus(latestBuild.status, latestBuild.result);
            } else if (branch.repoId) {
                const commitId = await this.getLatestCommit(branch.repoId, branch.name);
                if (commitId) {
                    const statuses = await this.getCommitStatuses(branch.repoId, commitId);
                    if (statuses && statuses.length > 0) {
                        status = this.convertCommitStatus(statuses[0].state);
                    }
                }
            }

            if (status !== 'none') {
                branchStatuses.push({ branchName: branch.name, status: status });
                if (status === 'failed') hasAnyFailed = true;
                if (status === 'partiallySucceeded') hasAnyPartiallySucceeded = true;
                if (status === 'canceled') hasAnyCanceled = true;
                if (status === 'inProgress') hasAnyInProgress = true;
                if (status === 'succeeded') hasAnySucceeded = true;
            }
        }));

        let overallStatus = 'none';
        if (hasAnyFailed) overallStatus = 'failed';
        else if (hasAnyPartiallySucceeded) overallStatus = 'partiallySucceeded';
        else if (hasAnyCanceled) overallStatus = 'canceled';
        else if (hasAnyInProgress) overallStatus = 'inProgress';
        else if (hasAnySucceeded) overallStatus = 'succeeded';

        return {
            workItemId,
            hasBuilds: branchStatuses.length > 0,
            branches: branchStatuses,
            overallStatus,
            totalBranches: branches.length,
            branchesWithBuilds: branchStatuses.length
        };
    }

    async calculatePRStatus(workItemId, prIds) {
        if (prIds.length === 0) {
            return { workItemId, hasBuilds: false, branches: [], overallStatus: 'none' };
        }

        const prStatuses = [];
        let hasAnyFailed = false;
        let hasAnyInProgress = false;
        let hasAnySucceeded = false;
        let hasAnyCompleted = false;

        // Fetch PR details in parallel
        const prs = await Promise.all(prIds.map(id => this.getPullRequestDetails(id)));
        const validPrs = prs.filter(p => p !== null);

        for (const pr of validPrs) {
            if ((pr.isDraft) || (pr.status === 'abandoned')) continue;
            
            if ((pr.status === 'completed') && (pr.mergeStatus === 'succeeded')) {
                hasAnyCompleted = true;                    
            }
            if (pr.status === 'active') {
                if (pr.mergeStatus === 'conflicts') {
                    hasAnyFailed = true;
                } else if (pr.mergeStatus === 'inProgress') {
                    hasAnyInProgress = true;
                } else if (pr.mergeStatus === 'succeeded') {
                    // Check build status for PR
                    const latestBuild = await this.getPullRequestLatestBuild(pr.pullRequestId);
                    if (latestBuild) {
                        const buildStatus = this.normalizeBuildStatus(latestBuild.status, latestBuild.result);
                        if (buildStatus === 'failed' || buildStatus === 'partiallySucceeded') {
                            hasAnyFailed = true;
                        } else if (buildStatus === 'inProgress') {
                            hasAnyInProgress = true;
                        } else {
                            hasAnySucceeded = true;
                        }
                    } else {
                        hasAnySucceeded = true;
                    }
                }                         
            }

            prStatuses.push({
                branchName: `PR-${pr.pullRequestId}`,
                status: pr.status,
            });
        }

        let overallStatus = 'none';
        if (hasAnyFailed) overallStatus = 'failed';
        else if (hasAnyInProgress) overallStatus = 'inProgress';
        else if (hasAnySucceeded) overallStatus = 'buildSucceeded';
        else if (hasAnyCompleted) overallStatus = 'completed';

        return {
            workItemId,
            hasBuilds: prStatuses.length > 0,
            branches: prStatuses,
            overallStatus,
            totalBranches: prIds.length,
            branchesWithBuilds: prStatuses.length
        };
    }

    /**
     * Get all branches linked to a work item
     * @param {number} workItemId - The work item ID
     * @returns {Promise<Array>} Array of branch references
     */
    async getWorkItemBranches(workItemId) {
        try {
            const url = `${this.baseUrl}/wit/workitems/${workItemId}?$expand=relations&api-version=7.0`;
            
            const authHeader = await this.getAuthHeader();
            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });

            this.throwIfAuthFailed(response);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const workItem = await response.json();
            const branches = [];

            // Extract branch references from relations
            if (workItem.relations) {
                for (const relation of workItem.relations) {
                    // Branch relation type
                    if (relation.rel === 'ArtifactLink' && relation.url.includes('vstfs:///Git/Ref/')) {
                        const branchUrl = relation.url;
                        const branchName = this.extractBranchName(branchUrl);
                        const repoId = this.extractRepoId(branchUrl);
                        if (branchName) {
                            branches.push({
                                name: branchName,
                                url: branchUrl,
                                repoId: repoId
                            });
                        }
                    }
                }
            }

            return branches;
        } catch (error) {
            console.error('Error fetching work item branches:', error);
            if (this.isAuthError(error)) throw error;
            return [];
        }
    }

    /**
     * Extract branch name from artifact URL
     * @param {string} url - Artifact URL
     * @returns {string} Branch name
     */
    extractBranchName(url) {
        try {
            // Extract branch name from URL format: vstfs:///Git/Ref/{projectId}/{repoId}/{branchName}
            const parts = url.split('/');
            if (parts.length > 0) {
                let name = decodeURIComponent(parts[parts.length - 1]);
                
                // Handle case where name contains project/repo info: "guid/guid/GBbranchName"
                if (name.includes('/GB')) {
                    name = name.substring(name.indexOf('/GB') + 3);
                }
                // Handle GB prefix
                else if (name.startsWith('GB')) {
                    name = name.substring(2);
                }
                
                return name;
            }
        } catch (error) {
            console.error('Error extracting branch name:', error);
        }
        return null;
    }
    
    /**
     * Extract Repo ID from artifact URL
     * @param {string} url - Artifact URL
     * @returns {string} Repo ID
     */
    extractRepoId(url) {
        try {
            // const parts = url.split('/');
            // if (parts.length > 6) {
            //     return parts[6];
            // }


            // vstfs:///Git/Ref/{projectId}/{repoId}/{branchName}
            const parts = url.split('/');
            if (parts.length > 0) {
                // {projectId}/{repoId}/{branchName} (encoded)
                let repoId = decodeURIComponent(parts[parts.length - 1]);            
                repoId = repoId.split('/')[1]; // Get repoId part
                
                return repoId;
            }
        } catch (error) {
            console.error('Error extracting repo ID:', error);
        }
        return null;
    }

    /**
     * Extract PR ID from artifact URL
     * @param {string} url - Artifact URL
     * @returns {string} PR ID
     */
    extractPullRequestId(url) {
        try {
            // vstfs:///Git/PullRequestId/{projectId}/{repoId}/{pullRequestId}
            // Example: vstfs:///Git/PullRequestId/guid%2Fguid%2F53123
            // Example URL: "vstfs:///Git/PullRequestId/880a58f3-336f-46eb-8e6c-55c17312a3dc%2Fcdb656ca-8f58-422b-bbfc-a45b19637eb6%2F53123"                        
            const lastPart = url.substring(url.lastIndexOf('/') + 1);
            const decodedPart = decodeURIComponent(lastPart);
            const idParts = decodedPart.split('/');
            return idParts[idParts.length - 1];
        } catch (error) {
            console.error('Error extracting PR ID:', error);
        }
        return null;
    }

    /**
     * Get builds for a specific branch
     * @param {string} branchName - The branch name (e.g., 'refs/heads/feature/123-add-feature')
     * @returns {Promise<Array>} Array of builds
     */
    async getBranchBuilds(branchName) {
        try {
            //Example of branch name: "75007-DealDiscount-Hotfix-26.1"
            // Ensure branch name has refs/heads/ prefix
            const fullBranchName = branchName.startsWith('refs/heads/') 
                ? branchName 
                : `refs/heads/${branchName}`;

            const url = `${this.baseUrl}/build/builds?branchName=${encodeURIComponent(fullBranchName)}&api-version=7.0`;

            const authHeader = await this.getAuthHeader();
            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });

            this.throwIfAuthFailed(response);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.value || [];
        } catch (error) {
            console.error('Error fetching branch builds:', error);
            if (this.isAuthError(error)) throw error;
            return [];
        }
    }

    /**
     * Get the latest build for a branch
     * @param {string} branchName - The branch name
     * @returns {Promise<Object|null>} Latest build or null
     */
    async getLatestBuild(branchName) {
        const builds = await this.getBranchBuilds(branchName);
        if (builds.length === 0) return null;

        // Sort by finish time (most recent first)
        builds.sort((a, b) => {
            const dateA = new Date(a.finishTime || a.queueTime);
            const dateB = new Date(b.finishTime || b.queueTime);
            return dateB - dateA;
        });

        return builds[0];
    }

    /**
     * Get details for a pull request
     * @param {string} pullRequestId - The PR ID
     * @returns {Promise<Object|null>} PR details
     */
    async getPullRequestDetails(pullRequestId) {
        try {
            const url = `${this.baseUrl}/git/pullrequests/${pullRequestId}?api-version=7.0`;
            const authHeader = await this.getAuthHeader();
            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });
            this.throwIfAuthFailed(response);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('Error fetching PR details:', error);
            if (this.isAuthError(error)) throw error;
            return null;
        }
    }

    /**
     * Get all pull requests linked to a work item
     * @param {number} workItemId - The work item ID
     * @returns {Promise<Array>} Array of pull request objects
     */
    async getWorkItemPullRequests(workItemId) {
        try {
            const url = `${this.baseUrl}/wit/workitems/${workItemId}?$expand=relations&api-version=7.0`;

            const authHeader = await this.getAuthHeader();
            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });

            this.throwIfAuthFailed(response);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const workItem = await response.json();
            const prPromises = [];

            if (workItem.relations) {
                for (const relation of workItem.relations) {
                    if (relation.rel === 'ArtifactLink' && relation.url.includes('vstfs:///Git/PullRequestId/')) {
                        const prId = this.extractPullRequestId(relation.url);
                        if (prId) {
                            prPromises.push(this.getPullRequestDetails(prId));
                        }
                    }
                }
            }

            const prs = await Promise.all(prPromises);
            return prs.filter(pr => pr !== null);
        } catch (error) {
            console.error('Error fetching work item PRs:', error);
            if (this.isAuthError(error)) throw error;
            return [];
        }
    }

    /**
     * Get the latest build for a pull request
     * @param {number} pullRequestId - The PR ID
     * @returns {Promise<Object|null>} Latest build or null
     */
    async getPullRequestLatestBuild(pullRequestId) {
        try {
            // Try to find builds for this PR (usually on refs/pull/{id}/merge)
            const branchName = `refs/pull/${pullRequestId}/merge`;
            const url = `${this.baseUrl}/build/builds?branchName=${encodeURIComponent(branchName)}&reasonFilter=pullRequest&queryOrder=queueTimeDescending&$top=1&api-version=7.0`;
            
            const authHeader = await this.getAuthHeader();
            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });

            this.throwIfAuthFailed(response);
            if (!response.ok) return null;

            const data = await response.json();
            if (data.value && data.value.length > 0) {
                return data.value[0];
            }
            return null;
        } catch (error) {
            console.error('Error fetching PR build:', error);
            if (this.isAuthError(error)) throw error;
            return null;
        }
    }

    /**
     * Normalize build status from Azure DevOps API
     * @param {string} status - Build status (inProgress, completed, etc.)
     * @param {string} result - Build result (succeeded, failed, etc.)
     * @returns {string} Normalized status
     */
    normalizeBuildStatus(status, result) {
        if (status === 'inProgress' || status === 'notStarted') {
            return 'inProgress';
        }
        
        if (status === 'completed') {
            switch (result) {
                case 'succeeded':
                    return 'succeeded';
                case 'failed':
                    return 'failed';
                case 'partiallySucceeded':
                    return 'partiallySucceeded';
                case 'canceled':
                    return 'canceled';
                default:
                    return 'unknown';
            }
        }

        return 'unknown';
    }

    /**
     * Get build status icon based on status
     * @param {string} status - Build status
     * @returns {Object} Icon configuration {emoji, color, title}
     */
    static getBuildStatusIcon(status) {
        const icons = {
            'succeeded': {
                emoji: '✅',
                color: '#107c10',
                title: 'All builds succeeded'
            },
            'failed': {
                emoji: '❌',
                color: '#9e7e7fff',
                title: 'Some builds failed'
            },
            'inProgress': {
                emoji: '🔄',
                color: '#0078d4',
                title: 'Builds in progress'
            },
            'partiallySucceeded': {
                emoji: '⚠️',
                color: '#ff8c00',
                title: 'Some builds partially succeeded'
            },
            'canceled': {
                emoji: '🚫',
                color: '#999',
                title: 'Builds canceled'
            },
            'none': {
                emoji: '🤷‍♀️',
                color: '#ccc',
                title: 'No builds found'
            },
            'error': {
                emoji: '⚠️',
                color: '#d13438',
                title: 'Error fetching build status'
            }
        };

        return icons[status] || icons['none'];
    }
    
    /**
     * Get pr status icon based on status
     * @param {string} status - Build status
     * @returns {Object} Icon configuration {emoji, color, title}
     */
    static getPrStatusIcon(status) {
        const icons = {
            'completed': {
                emoji: '✅',
                color: '#107c10',
                title: 'All PRs completed'
            },
            'failed': {
                emoji: '❌',
                color: '#9e7e7fff',
                title: 'Some PRs failed'
            },
            'inProgress': {
                emoji: '🔄',
                color: '#0078d4',
                title: 'PRs in progress'
            },
            'buildSucceeded': {
                emoji: '🆗',
                color: '#ff8c00',
                title: 'All PRs builds succeeded'
            },
            'canceled': {
                emoji: '🚫',
                color: '#999',
                title: 'PRs canceled'
            },
            'none': {
                emoji: '🤷‍♀️',
                color: '#ccc',
                title: 'No PRs found'
            },
            'error': {
                emoji: '⚠️',
                color: '#d13438',
                title: 'Error fetching PR status'
            }
        };

        return icons[status] || icons['none'];
    }

    /**
     * Get the latest commit for a branch
     * @param {string} repoId - The repository ID
     * @param {string} branchName - The branch name
     * @returns {Promise<string|null>} Commit ID (SHA) or null
     */
    async getLatestCommit(repoId, branchName) {
        try {
            // Clean branch name for filter
            let filterName = branchName;
            if (filterName.startsWith('refs/heads/')) {
                filterName = filterName.substring('refs/heads/'.length);
            }
            
            const url = `${this.baseUrl}/git/repositories/${repoId}/refs?filter=heads/${encodeURIComponent(filterName)}&api-version=7.0`;
            const authHeader = await this.getAuthHeader();
            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });

            this.throwIfAuthFailed(response);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.value && data.value.length > 0) {
                return data.value[0].objectId;
            }
            return null;
        } catch (error) {
            console.error('Error fetching latest commit:', error);
            if (this.isAuthError(error)) throw error;
            return null;
        }
    }

    /**
     * Get statuses for a specific commit
     * @param {string} repoId - The repository ID
     * @param {string} commitId - The commit ID
     * @returns {Promise<Array>} Array of statuses
     */
    async getCommitStatuses(repoId, commitId) {
        try {
            const url = `${this.baseUrl}/git/repositories/${repoId}/commits/${commitId}/statuses?api-version=7.0`;
            const authHeader = await this.getAuthHeader();
            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });

            this.throwIfAuthFailed(response);
            if (!response.ok) return [];
            const data = await response.json();
            return data.value || [];
        } catch (error) {
            console.error('Error fetching commit statuses:', error);
            if (this.isAuthError(error)) throw error;
            return [];
        }
    }

    /**
     * Aggregate multiple commit statuses into a single status
     * @param {Array} statuses - Array of commit status objects
     * @returns {string} Aggregated status
     */
    convertCommitStatus(commitState) {
        if (!commitState || commitState === '') return 'none';
        
        if (commitState === 'failed' || commitState === 'error') return 'failed';
        if (commitState=== 'pending') return 'inProgress';
        return 'succeeded';
    }    
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AzureDevOpsAPI;
}
