# Privacy Policy for ADO Helper

**Last Updated:** September 4, 2026

This Privacy Policy describes how **ADO Helper** ("we", "us", or "our") handles your information when you use our browser extension.

## 1. Data Collection and Storage

**ADO Helper** is designed with privacy in mind. We do **not** collect, store, or transmit your personal data to any third-party servers, analytics services, or tracking systems.

### Local Storage
The extension stores the following information locally on your device using Chrome's storage APIs:
- **Azure DevOps Configuration**: Organization name and Project name (sync storage).
- **Authentication** (depends on the method you choose in Options):
  - **OAuth** ("Sign in with Microsoft"): a short-lived access token and a refresh token obtained from Microsoft Entra ID, stored in the extension's local storage.
  - **Personal Access Token (PAT)**: your PAT, stored in the extension's local storage.
  - **Browser session**: **nothing is stored**. The extension uses the `dev.azure.com` sign-in session you already have in the browser; it never reads cookie values.
- **Extension Preferences**: Custom rules for branch naming, tag preferences, and UI settings.

This data is stored solely to enable the functionality of the extension (authenticating with Azure DevOps and generating branch names).

## 2. Data Usage

Your data is used exclusively for the following purposes:
- **Authentication**: Depending on the selected method, requests are authenticated with your PAT, with an OAuth token from Microsoft Entra ID, or with your existing `dev.azure.com` browser session. In all cases, requests are made directly between your browser and the official Azure DevOps REST API (`dev.azure.com`).
- **Functionality**: To fetch work item details, build statuses, and pull request information to display within the Azure DevOps interface.

## 3. Third-Party Services

The extension communicates directly with:
- **Azure DevOps**: To retrieve work item and build data. Please refer to [Microsoft's Privacy Statement](https://privacy.microsoft.com/en-us/privacystatement) for information on how they handle your data.
- **Microsoft Entra ID** (`login.microsoftonline.com`): Only when you use the OAuth "Sign in with Microsoft" method, to authenticate and obtain the access token.

We do **not** use any third-party analytics tools (like Google Analytics) or advertising networks.

## 4. Data Security

- **Direct Communication**: All API requests are made directly from your browser to Azure DevOps over a secure HTTPS connection. Your credentials never pass through any intermediate servers owned by us.
- **Token Safety**: OAuth tokens and PATs are stored in the extension's local browser storage and never leave your device except for the direct API requests described above. The "Browser session" method stores no credentials at all, so there is nothing at rest to protect or revoke.
- While we take measures to mask secrets in logs, it is your responsibility to keep your local browser environment secure.

## 5. Your Rights

Since we do not collect or store your data on our servers, you have full control over your information. You can:
- **View Your Data**: Check the extension's "Options" page to see all stored settings.
- **Delete Your Data**: Uninstalling the extension will remove all locally stored data associated with it. You can also manually clear the configuration in the Options page.

## 6. Changes to This Policy

We may update this Privacy Policy from time to time. If we make material changes, we will notify you by updating the date at the top of this policy and, where feasible, providing notice through the extension.

## 7. Contact Us

If you have any questions about this Privacy Policy, please contact us via our [GitHub Repository](https://github.com/malzahuar/ado-helper-extension).
