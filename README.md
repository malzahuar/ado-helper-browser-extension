# ADO Helper Extension

**ADO Helper** is a Microsoft Edge extension designed to supercharge your Azure DevOps (ADO) workflow. It streamlines branch creation and provides instant visual feedback on Build and PR statuses directly on your boards.

## 🚀 Features

### 1. Smart Branch Name Generator
Automatically generates standardized branch names based on the work item you are viewing.
- **One-Click Generation**: Click the ✨ icon in the "Create Branch" dialog.
- **Configurable Formats**: Custom prefixes for User Stories, Bugs, and Hotfixes.
- **Clean Formatting**: Automatically sanitizes titles (removes special characters, replaces spaces with hyphens).

![Example: Branch Name Generator](images/ScreenshotExtension1.png)

### 2. Visual Build & PR Statuses
Get immediate insight into the health of your work items directly from the Kanban board or Backlog view.
- **Build Status**: Shows the status of the latest build linked to the ticket.
- **PR Status**: Shows the status of active Pull Requests.
- **Visual Indicators**:
  - ✅ **Succeeded**: All builds/PRs passed.
  - ⚠️ **Partially Succeeded**: Warnings present (Yellow).
  - ❌ **Failed**: Build or PR failed.
  - 🔄 **In Progress**: Currently running.
  - 🚫 **Canceled**: Operation was canceled.
  - 🤷‍♀️ **Not Found**: Build or PR not found.

![Example: Board with status icons updated](images/ScreenshotExtension.png)

### 3. Customizable Settings
Configure the extension to match your team's workflow via the Options page.
- Set custom branch prefixes.
- Toggle specific features on/off.
- Securely manage ADO API credentials.

## 📦 Installation

1. Clone or download this repository to your local machine.
2. Open Microsoft Edge and navigate to `edge://extensions`.
3. Enable **"Developer mode"** using the toggle in the bottom-left or top-right corner.
4. Click **"Load unpacked"**.
5. Select the `ado-helper-browser-extension` folder containing the `manifest.json` file.

## ⚙️ Configuration

To enable the Build and PR status features, you must configure your Azure DevOps details:

### Step 1: Basic Settings
1. Click the extension icon in your browser toolbar and select **Options**.
2. Enter your **Organization Name** and **Project Name**.

### Step 2: Choose Authentication Method

#### Option A: OAuth (Recommended)
1. Select **"OAuth (Recommended)"** as the authentication method.
2. The **OAuth Client ID** field comes pre-filled with a default value.
3. Click **"Sign In with Microsoft"** and complete the authentication.
4. Click **Save**.

**For Company Employees:**  
If this is the first sign-in from your company, your IT admin will see an approval prompt. Once approved, all employees get instant access.

**For Individual Users (work/school):**  
If your work or school (Entra ID) account is a member of the Azure DevOps organization, sign in directly - no admin approval is needed for self-service consent.

⚠️ **Important account limitation:** "Sign in with Microsoft" only supports **work or school accounts**. Personal Microsoft accounts (Outlook, Hotmail, Gmail-linked, etc.) are rejected by Microsoft Entra ID with "You can't sign in with a personal account. Use your work or school account instead", because the Azure DevOps token used by this extension is only available to organizational accounts. If you only have a personal Microsoft account, use **Option C (Browser Session)** below (recommended) or **Option B (Personal Access Token)**.

**Consent Note:** OAuth delegated sign-in shows the Azure DevOps permissions requested by the extension (`Code (Read)`, `Build (Read)`, `Work Items (Read)`). These do not grant any access beyond reading the boards, builds, and PRs shown by the extension.

**Note:** If your admin provided a custom OAuth app, clear the Client ID field and enter theirs instead. For detailed OAuth setup instructions, see [ENTRA ID Setup Guide](ENTRA_ID_ADMIN_SETUP.md).

#### Option B: Personal Access Token (PAT)
1. Select **"Personal Access Token"** as the authentication method.
2. Enter your **Personal Access Token** (requires `Build (Read)`, `Code (Read)`, and `Work Items (Read)` scopes).
3. Click **Save**.

#### Option C: Browser Session (Recommended for Personal Accounts)
1. Select **"Browser session"** as the authentication method.
2. Click **Save**.

**How it works:** The extension calls the Azure DevOps REST API using the sign-in session you already have in this browser - no separate login, Client ID, or token is required. It works with **personal Microsoft accounts** and work/school accounts alike.

**Requirements:**
- You must be **signed in to `dev.azure.com`** in this browser with an account that is a member of the Azure DevOps organization and project you configured in the Basic Settings.
- If the status icons do not appear, make sure you are signed in to `dev.azure.com`, then switch back to **Option A** (work/school accounts) or **Option B** (PAT) if needed.

## 📖 Usage

### Generating a Branch Name
1. Open a Work Item in Azure DevOps.
2. Click the "Create Branch" link.
3. In the dialog, look for the ✨ icon inside the branch name input field.
4. Click it to populate the field with your formatted branch name.

### Viewing Build Statuses
1. Navigate to your ADO **Boards** or **Sprints** view.
2. The extension will automatically fetch and display status icons (✅, ❌, etc.) on the bottom right of the work item cards.
3. Hover over an icon to see a tooltip with more details (e.g., "Some builds failed").

## 🛠️ Development

To make changes to the extension:

1. Edit the files in your local folder (e.g., `src/content.js`, `src/azureDevOpsApi.js`).
2. Go to `edge://extensions` in your browser.
3. Find the **ADO Helper** card.
4. Click the **Reload** button (circular arrow icon).
5. Refresh your Azure DevOps page to see the changes.

## 🔒 Security

**OAuth (Recommended):**  
Tokens are short-lived and stored securely in your browser. They are never sent to any third-party server; they are only used to communicate directly with the Azure DevOps REST API.

**Personal Access Token (PAT):**  
Your PAT is stored locally in your browser using the `chrome.storage.sync` API. It is never sent to any third-party server; it is only used to communicate directly with the Azure DevOps REST API.

**Browser Session:**  
No credentials are stored by the extension. API calls use the session cookies of your existing `dev.azure.com` sign-in and never leave the browser; nothing is sent to any third-party server.

**Security notes on Browser Session mode:**
- The extension never reads cookie values and does not request the `cookies` permission; the browser attaches the session cookies automatically, and only to `https://dev.azure.com` requests.
- No secret is kept at rest, so there is nothing stored that could be stolen and replayed from another device (unlike PAT, which syncs, or OAuth refresh tokens).
- Requests inherit the interactive sign-in session, which has already satisfied any MFA / Conditional Access policies of the organization.
- This mode is **read-only by design**: the extension only performs GET requests (work items, builds, PRs). It must never be extended to write operations.
- As with any extension, only install builds you trust: an extension with host permission for `dev.azure.com` can act with the rights of your signed-in session.

## 📜 Version History

### v1.3.0
- **New**: "Browser session" authentication method (experimental) — supports **personal Microsoft accounts** by reusing the `dev.azure.com` sign-in you already have in the browser.
- **Improved**: OAuth (Entra ID) sign-in reliability (PKCE, token handling moved to the service worker) and clearer authentication error messages.
- **Docs**: Rewritten Entra ID app registration setup guide; updated security/privacy notes.

### v1.2.0
- **Fix**: Resolved an issue where the PR status was incorrectly calculated when PR failed first time and new commit is pushed.
- 
### v1.1.0
- **Fix**: Resolved an issue where the PR status was incorrectly calculated when the merge status was "succeeded".

### v1.0.0
- Initial release with Branch Name Generator and Build/PR Status indicators.

## 📄 License
[MIT](LICENSE)
