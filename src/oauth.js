/**
 * OAuth 2.0 Authentication Module for Microsoft Entra ID
 * Handles OAuth flow with Azure DevOps using chrome.identity API
 */

class OAuth {
    constructor(clientId) {
        this.clientId = (clientId || '').trim();
        this.redirectUri = chrome.identity.getRedirectURL();
        this.authority = 'https://login.microsoftonline.com/common/oauth2/v2.0';
        // Explicit ADO delegated scopes — avoids pulling in User.Read via /.default.
        // Format: {resource-id}/{scope} space-separated, per Entra v2.0 spec.
        this.scope = [
            '499b84ac-1321-427f-aa17-267ca6975798/vso.work',
            '499b84ac-1321-427f-aa17-267ca6975798/vso.code',
            '499b84ac-1321-427f-aa17-267ca6975798/vso.build',
            'offline_access'
        ].join(' ');
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
     * Generate a PKCE code verifier (random URL-safe string)
     * @private
     * @returns {string} Code verifier
     */
    generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Generate a PKCE code challenge from a verifier (BASE64URL(SHA-256(verifier)))
     * @private
     * @param {string} verifier - The code verifier
     * @returns {Promise<string>} Code challenge
     */
    async generateCodeChallenge(verifier) {
        const data = new TextEncoder().encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Initiate OAuth login flow
     * @returns {Promise<Object>} Token response { access_token, token_type, expires_in }
     */
    async login() {
        try {
            // Generate PKCE pair — required for SPA client type in Entra ID.
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = await this.generateCodeChallenge(codeVerifier);

            const authUrl = this.buildAuthUrl(codeChallenge);
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

            // Extract authorization code from redirect URL and surface OAuth errors clearly.
            const code = this.extractAuthCode(responseUrl);

            // Exchange authorization code for tokens
            const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier);

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
     * @param {string} codeChallenge - PKCE code challenge
     * @returns {string} The authorization URL
     */
    buildAuthUrl(codeChallenge) {
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: this.scope,
            response_mode: 'query',
            prompt: 'select_account',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
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
        const payload = this.parseOAuthResponse(redirectUrl);

        if (payload.error) {
            const description = payload.error_description || payload.error;
            throw new Error(`OAuth authorization failed: ${description}`);
        }

        if (!payload.code) {
            throw new Error(
                'Failed to extract authorization code from response. Verify your app registration redirect URI matches exactly: ' +
                this.redirectUri
            );
        }

        return payload.code;
    }

    /**
     * Parse OAuth callback data from both query string and fragment.
     * @private
     * @param {string} redirectUrl - The redirect URL returned by launchWebAuthFlow
     * @returns {{code: string|null, error: string|null, error_description: string|null}}
     */
    parseOAuthResponse(redirectUrl) {
        const url = new URL(redirectUrl);

        const extract = (params) => ({
            code: params.get('code'),
            error: params.get('error'),
            error_description: params.get('error_description')
        });

        // Prefer explicit query payload when response_mode=query is honored.
        let payload = extract(url.searchParams);
        if (payload.code || payload.error) {
            return payload;
        }

        // Some providers/policies can still send data in the fragment.
        const hash = url.hash ? url.hash.substring(1) : '';
        if (hash) {
            payload = extract(new URLSearchParams(hash));
            if (payload.code || payload.error) {
                return payload;
            }
        }

        return {
            code: null,
            error: null,
            error_description: null
        };
    }

    /**
     * Exchange authorization code for tokens
     * @private
     * @param {string} code - The authorization code
     * @param {string} codeVerifier - PKCE code verifier matching the challenge sent in the auth request
     * @returns {Promise<Object>} Token response
     */
    async exchangeCodeForToken(code, codeVerifier) {
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
                    scope: this.scope,
                    code_verifier: codeVerifier
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
