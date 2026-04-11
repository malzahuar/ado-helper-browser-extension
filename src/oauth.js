/**
 * OAuth 2.0 Authentication Module for Microsoft Entra ID
 * Handles OAuth flow with Azure DevOps using chrome.identity API
 */

class OAuth {
    constructor(clientId) {
        this.clientId = clientId;
        this.redirectUri = chrome.identity.getRedirectURL();
        this.authority = 'https://login.microsoftonline.com/common/oauth2/v2.0';
        this.scope = 'https://management.azure.com/.default';
        this.tokenStorageKey = 'entraIdToken';
        this.expiryStorageKey = 'entraIdTokenExpiry';
    }

    /**
     * Get the redirect URI for app registration
     * @returns {string} The redirect URI
     */
    getRedirectUri() {
        return this.redirectUri;
    }

    /**
     * Initiate OAuth login flow
     * @returns {Promise<Object>} Token response { access_token, token_type, expires_in }
     */
    async login() {
        try {
            const authUrl = this.buildAuthUrl();
            console.log('Initiating OAuth login flow...');

            // Launch the web auth flow
            const responseUrl = await new Promise((resolve, reject) => {
                chrome.identity.launchWebAuthFlow(
                    {
                        url: authUrl,
                        interactive: true
                    },
                    (redirectUrl) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (redirectUrl) {
                            resolve(redirectUrl);
                        } else {
                            reject(new Error('Auth flow cancelled'));
                        }
                    }
                );
            });

            // Extract authorization code from redirect URL
            const code = this.extractAuthCode(responseUrl);
            if (!code) {
                throw new Error('Failed to extract authorization code from response');
            }

            // Exchange authorization code for tokens
            const tokenResponse = await this.exchangeCodeForToken(code);
            
            // Store token and expiry time
            await this.storeToken(tokenResponse);
            
            console.log('OAuth login successful');
            return tokenResponse;
        } catch (error) {
            console.error('OAuth login failed:', error);
            throw error;
        }
    }

    /**
     * Build the authorization URL
     * @private
     * @returns {string} The authorization URL
     */
    buildAuthUrl() {
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: this.scope,
            response_mode: 'query',
            prompt: 'select_account'
        });

        return `${this.authority}/authorize?${params.toString()}`;
    }

    /**
     * Extract authorization code from redirect URL
     * @private
     * @param {string} redirectUrl - The redirect URL containing the code
     * @returns {string|null} The authorization code or null if not found
     */
    extractAuthCode(redirectUrl) {
        const url = new URL(redirectUrl);
        return url.searchParams.get('code');
    }

    /**
     * Exchange authorization code for tokens
     * @private
     * @param {string} code - The authorization code
     * @returns {Promise<Object>} Token response
     */
    async exchangeCodeForToken(code) {
        try {
            const response = await fetch(`${this.authority}/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    code: code,
                    redirect_uri: this.redirectUri,
                    grant_type: 'authorization_code',
                    scope: this.scope
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Token exchange error:', error);
            throw error;
        }
    }

    /**
     * Get valid access token (refreshes if expired)
     * @returns {Promise<string>} Valid access token
     */
    async getValidToken() {
        try {
            const stored = await this.getStoredToken();
            
            if (!stored) {
                throw new Error('No token found. Please login first.');
            }

            // Check if token is expired or about to expire (5 minute buffer)
            if (this.isTokenExpired(stored.expiry)) {
                console.log('Token expired, refreshing...');
                if (stored.refresh_token) {
                    // If you implement refresh token flow
                    return await this.refreshToken(stored.refresh_token);
                } else {
                    // Re-login if no refresh token
                    const newToken = await this.login();
                    return newToken.access_token;
                }
            }

            return stored.access_token;
        } catch (error) {
            console.error('Error getting valid token:', error);
            throw error;
        }
    }

    /**
     * Check if token is expired
     * @private
     * @param {number} expiryTimestamp - Token expiry timestamp in milliseconds
     * @returns {boolean} True if expired
     */
    isTokenExpired(expiryTimestamp) {
        const bufferMs = 5 * 60 * 1000; // 5 minute buffer
        return Date.now() > (expiryTimestamp - bufferMs);
    }

    /**
     * Store token in secure storage
     * @private
     * @param {Object} tokenResponse - Token response from OAuth provider
     * @returns {Promise<void>}
     */
    async storeToken(tokenResponse) {
        try {
            const expiryTime = Date.now() + (tokenResponse.expires_in * 1000);
            
            const tokenData = {
                access_token: tokenResponse.access_token,
                token_type: tokenResponse.token_type || 'Bearer',
                expires_in: tokenResponse.expires_in,
                expiry: expiryTime
            };

            if (tokenResponse.refresh_token) {
                tokenData.refresh_token = tokenResponse.refresh_token;
            }

            return new Promise((resolve, reject) => {
                chrome.storage.local.set(
                    { [this.tokenStorageKey]: tokenData },
                    () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    }
                );
            });
        } catch (error) {
            console.error('Error storing token:', error);
            throw error;
        }
    }

    /**
     * Get stored token
     * @private
     * @returns {Promise<Object|null>} Stored token or null
     */
    getStoredToken() {
        return new Promise((resolve) => {
            chrome.storage.local.get([this.tokenStorageKey], (result) => {
                resolve(result[this.tokenStorageKey] || null);
            });
        });
    }

    /**
     * Logout and clear stored token
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            return new Promise((resolve, reject) => {
                chrome.storage.local.remove([this.tokenStorageKey], () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        console.log('Logged out successfully');
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.error('Error during logout:', error);
            throw error;
        }
    }

    /**
     * Check if user is authenticated
     * @returns {Promise<boolean>} True if authenticated
     */
    async isAuthenticated() {
        try {
            const token = await this.getStoredToken();
            if (!token) return false;
            
            // Check if token is expired
            return !this.isTokenExpired(token.expiry);
        } catch (error) {
            console.error('Error checking authentication:', error);
            return false;
        }
    }

    /**
     * Refresh access token using refresh token
     * @private
     * @param {string} refreshToken - The refresh token
     * @returns {Promise<string>} New access token
     */
    async refreshToken(refreshToken) {
        try {
            const response = await fetch(`${this.authority}/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                    scope: this.scope
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
            }

            const newTokenResponse = await response.json();
            await this.storeToken(newTokenResponse);
            return newTokenResponse.access_token;
        } catch (error) {
            console.error('Token refresh error:', error);
            // If refresh fails, clear token and ask user to login again
            await this.logout();
            throw error;
        }
    }
}
