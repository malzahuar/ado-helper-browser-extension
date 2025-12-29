# Privacy Policy for ADO Helper

**Last Updated:** December 6, 2025

This Privacy Policy describes how **ADO Helper** ("we", "us", or "our") handles your information when you use our browser extension.

## 1. Data Collection and Storage

**ADO Helper** is designed with privacy in mind. We do **not** collect, store, or transmit your personal data to any third-party servers, analytics services, or tracking systems.

### Local Storage
The extension stores the following information locally on your device using your browser's sync storage capabilities (`chrome.storage.sync`):
- **Azure DevOps Configuration**: Organization name, Project name, and Personal Access Token (PAT).
- **Extension Preferences**: Custom rules for branch naming, tag preferences, and UI settings.

This data is stored solely to enable the functionality of the extension (authenticating with Azure DevOps and generating branch names).

## 2. Data Usage

Your data is used exclusively for the following purposes:
- **Authentication**: The Personal Access Token (PAT) is used to authenticate requests directly between your browser and the official Azure DevOps REST API (`dev.azure.com`).
- **Functionality**: To fetch work item details, build statuses, and pull request information to display within the Azure DevOps interface.

## 3. Third-Party Services

The extension communicates directly with:
- **Azure DevOps**: To retrieve work item and build data. Please refer to [Microsoft's Privacy Statement](https://privacy.microsoft.com/en-us/privacystatement) for information on how they handle your data.

We do **not** use any third-party analytics tools (like Google Analytics) or advertising networks.

## 4. Data Security

- **Direct Communication**: All API requests are made directly from your browser to Azure DevOps over a secure HTTPS connection. Your PAT never passes through any intermediate servers owned by us.
- **Token Safety**: Your Personal Access Token is stored in your browser's local storage. While we take measures to mask this token in logs, it is your responsibility to keep your local browser environment secure.

## 5. Your Rights

Since we do not collect or store your data on our servers, you have full control over your information. You can:
- **View Your Data**: Check the extension's "Options" page to see all stored settings.
- **Delete Your Data**: Uninstalling the extension will remove all locally stored data associated with it. You can also manually clear the configuration in the Options page.

## 6. Changes to This Policy

We may update this Privacy Policy from time to time. If we make material changes, we will notify you by updating the date at the top of this policy and, where feasible, providing notice through the extension.

## 7. Contact Us

If you have any questions about this Privacy Policy, please contact us via our [GitHub Repository](https://github.com/malzahuar/ado-helper-extension).
