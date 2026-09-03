# Microsoft Entra ID App Registration Setup Guide

Setup OAuth 2.0 for the ADO Helper extension to support company employees (admin consent flow), individual users with work or school accounts (direct sign-in), and multiple organizations with a single app registration.

**Flow:** First employee from a company → admin sees approval prompt → approves once → all other employees get instant access. Individual users whose work/school (Entra ID) account is a member of the Azure DevOps organization can sign in directly.

⚠️ **Account type limitation:** This OAuth flow authenticates against Microsoft Entra ID and requests a token for the **Azure DevOps resource, which is only available to organizational (work or school) accounts**. **Personal Microsoft accounts (Outlook/Hotmail/Live/Gmail-linked, etc.) are rejected by Entra** with "You can't sign in with a personal account. Use your work or school account instead". Personal-account users should use the extension's **Browser session** authentication method (recommended - it reuses the user's existing `dev.azure.com` sign-in and needs no app registration, see the README) or the **PAT** method, instead of "Sign in with Microsoft".

---

## 🎯 Default Client ID Feature

The extension comes **pre-configured with a default Client ID** that works immediately for all users.

If an admin needs a **different** Client ID and Redirect URI, they can override the default by clearing the field and entering their own.

---

## Prerequisites

- Admin access to Microsoft Entra ID tenant (for the master app)
- Active Azure Subscription (optional, but recommended)
- Azure DevOps organization for testing

## Step 1: Create App Registration (Multi-Tenant)

1. Sign in to [Azure Portal](https://portal.azure.com) with your company tenant
2. Navigate to **Azure Entra ID** → **App registrations**
3. Click **→ New registration**
4. Fill in:
   - **Name**: `ADO Helper Extension` (or similar)
   - **Supported account types**: 
     - **Multi-Tenant** (recommended for wider use): Select **"Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"** - one app registration usable by any company. (Selecting the personal-accounts option does **not** enable personal Microsoft accounts for this flow - the Azure DevOps token is organizational-only, see the limitation note above.)
     - **Single-Tenant** (internal use only): Select **"Accounts in this organizational directory only"** - allows only your company employees
   - **Redirect URI**: register it as described under **"Register the redirect URI"** below
   - **Redirect URI value**: `https://<extension-id>.chromiumapp.org/`. Copy the value from Options page.

5. Click **Register**

### Register the redirect URI (public client)

The extension authenticates as a **public client**: it uses PKCE and never sends a client secret (a secret baked into a browser extension is not secret, because every user can read the extension's code). Use **either** configuration below:

**Option 1 — Web platform + "Allow public client flows" (recommended)**

This is the configuration Chrome/Edge extensions normally use, because Entra only accepts remote `https://...chromiumapp.org` redirect URIs on the **Web** platform — the "Mobile and desktop applications" platform only allows loopback URIs (`http://localhost`) or custom schemes.

1. In **Authentication → Platform configurations**, click **Add a platform → Web**.
2. Set the redirect URI to `https://<extension-id>.chromiumapp.org/`.
3. In **Authentication → Advanced settings**, set **Allow public client flows** to **Yes**.

⚠️ If you skip step 3, Entra treats the app as a confidential "Web" client and rejects the token exchange because no client secret is sent (`AADSTS7000218`).

**Option 2 — Mobile and desktop applications (public client/native)**

Use this only if the Entra portal accepts the URI under this platform (some consoles do). A "Mobile and desktop applications" registration is a public client by default, so no extra toggle is needed.

> Either option gives the same result: PKCE sign-in with no secret and normal refresh-token lifetimes. What you must **not** use:
> - **Web without "Allow public client flows = Yes"** → Entra demands a client secret the extension cannot safely ship.
> - **Single-page application (SPA)** → Microsoft caps SPA refresh tokens at ~24 hours, so users would be forced to sign in again daily.

## Step 2: Configure API Permissions

1. In the app registration, go to **API permissions**
2. Click **→ Add a permission**
3. Select **Azure DevOps**
4. Select **Delegated permissions**
5. Check these scopes:
  - `vso.code` (Code - Read)
  - `vso.build` (Build - Read)
  - `vso.work` (Work Items - Read)
6. Click **Add permissions**
7. In **API permissions**, verify **Microsoft Graph** includes delegated `User.Read`:
   - If it is already present (default in many app registrations), keep it.
   - If it is missing, add **Microsoft Graph** → **Delegated permissions** → `User.Read`.

🔐 **Why `User.Read` is needed:**
- It enables the delegated OAuth sign-in consent entry ("Sign in and read user profile").
- It is used for user authentication context and does **not** grant extra Azure DevOps REST API access.

🔐 **What these permissions allow:**
- **Read Work Items** - View Azure DevOps work items
- **Read Code** - Access repositories
- **Read Build** - View build pipelines and status

⚠️ **Important:** Avoid selecting `user_impersonation` for this extension. It grants broad REST API access and causes a much wider consent prompt.

ℹ️ **Expected consent prompt:** Users can still see a baseline sign-in permission (for example, "Sign in and read user profile"). This is required for delegated OAuth authentication and does **not** grant extra Azure DevOps API access beyond the configured read scopes.

8. Click **Grant admin consent for [Your Tenant Name]**

## Step 3: Get Client ID

1. In app registration, go to **Overview**
2. Copy **Application (client) ID** - this is what you'll share with all users
3. Do NOT copy the Object ID (that's different)

**Example Client ID format:**
```
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

ℹ️ **This single Client ID works for everyone** - companies, individuals, and across all redirect URIs

## Step 4: Distribute the Client ID

Share the Client ID from Step 3 with users:

**For companies**: Share with IT admin  
→ First employee from company triggers admin approval  
→ Admin approves in Azure Entra ID  
→ All other employees can sign in immediately

**For individual users (work/school)**: Share the Client ID  
→ Users whose work or school account is a member of the Azure DevOps organization sign in directly (self-service consent, no admin approval needed).  
→ Users with **personal Microsoft accounts** cannot use this OAuth flow — they must use the PAT method in the extension instead.



## Summary Checklist

### App Registration Setup
- [ ] Created App Registration in Entra ID
- [ ] Selected account type:
  - [ ] Multi-Tenant: "Accounts in any organizational directory + personal Microsoft accounts"
  - [ ] Single-Tenant: "Accounts in this organizational directory only"
- [ ] Registered redirect URI as **Web + "Allow public client flows = Yes"** (or as **Public client/native** if the portal accepts it): `https://<extension-id>.chromiumapp.org/`
- [ ] Configured Azure DevOps API permissions
- [ ] Verified Microsoft Graph delegated `User.Read` is present
- [ ] Granted admin consent in your tenant
- [ ] Copied Client ID

### Configuration & Security
- [ ] Set appropriate token lifetime (1 hour recommended)
- [ ] Configured Conditional Access/MFA if needed
- [ ] Enabled audit logging for compliance
- [ ] Confirmed baseline delegated sign-in consent is approved by admin policy
- [ ] Tested with work/school user from a different company
- [ ] Confirmed personal Microsoft accounts are rejected with "work or school account required" (expected behavior)

### Testing
- [ ] Tested extension with Client ID (work/school account)
- [ ] Tested company employee sign-in (admin consent flow)
- [ ] Tested individual work/school user sign-in (direct login)


