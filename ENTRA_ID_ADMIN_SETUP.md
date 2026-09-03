# Microsoft Entra ID App Registration Setup Guide

Configure the **OAuth 2.0** flow ("Sign in with Microsoft") of the ADO Helper extension. This flow authenticates against Microsoft Entra ID and is intended for **work or school (Entra ID) accounts** — company employees and individual users whose work/school account is a member of their Azure DevOps organization.

**Flow:** The first employee of a company to sign in triggers an admin approval prompt. Once the admin approves, all other employees get instant access. Individual users whose work/school account is a member of the Azure DevOps organization can sign in directly with self-service consent.

⚠️ **Account type limitation:** This OAuth flow requests a token for the **Azure DevOps resource, which is only available to organizational (work or school) accounts**. **Personal Microsoft accounts (Outlook/Hotmail/Live/Gmail-linked, etc.) are rejected by Entra** with "You can't sign in with a personal account. Use your work or school account instead". If you only have a personal Microsoft account, use the extension's **Browser session** authentication method (recommended — it reuses your existing `dev.azure.com` sign-in and needs no app registration) or the **PAT** method. See the README for the three authentication methods.

---

## 🎯 Default Client ID Feature

The extension ships **pre-configured with a default Client ID** so company employees can sign in immediately once their admin has granted consent for that registration.

If an admin needs a **different** Client ID (and matching Redirect URI), they can create their own registration (steps below) and override the default by clearing the field in the Options page and entering theirs.

---

## Prerequisites

- Admin access to Microsoft Entra ID tenant (to create the app registration)
- Azure DevOps organization for testing
- A work/school account that is a member of the Azure DevOps organization

## Step 1: Create the App Registration

1. Sign in to [Azure Portal](https://portal.azure.com) with your tenant
2. Navigate to **Microsoft Entra ID** → **App registrations**
3. Click **→ New registration**
4. Fill in:
   - **Name**: `ADO Helper` (or similar)
   - **Supported account types** (choose one):
     - **Single-Tenant** (internal use): *"Accounts in this organizational directory only"* — only your company's employees.
     - **Multi-Tenant** (several companies): *"Accounts in any organizational directory (Any Microsoft Entra ID tenant – Multitenant)"* — one registration usable by any company.
     - ℹ️ Selecting *"... and personal Microsoft accounts"* does **not** enable personal accounts for this flow (the Azure DevOps token is organizational-only, see the limitation note above), so it is optional.
   - **Redirect URI**: platform **Web** → `https://<extension-id>.chromiumapp.org/` (copy the exact value from the Options page → Redirect URI field).

5. Click **Register**

### Register the redirect URI (public client)

The extension authenticates as a **public client**: it uses PKCE and never sends a client secret (a secret baked into a browser extension is not secret, because every user can read the extension's code). Use **either** configuration:

**Option 1 — Web platform + "Allow public client flows" (recommended)**

This is the configuration Chrome/Edge extensions normally use, because Entra only accepts remote `https://...chromiumapp.org` redirect URIs on the **Web** platform — the "Mobile and desktop applications" platform only allows loopback URIs (`http://localhost`) or custom schemes.

1. In **Authentication → Platform configurations**, click **Add a platform → Web** and set the redirect URI to `https://<extension-id>.chromiumapp.org/`.
2. In **Authentication → Advanced settings**, set **Allow public client flows** to **Yes**.

⚠️ Without step 2, Entra treats the app as a confidential "Web" client and rejects the token exchange because no client secret is sent (`AADSTS7000218`).

**Option 2 — Mobile and desktop applications (public client/native)**

Use this only if the Entra portal accepts the URI under this platform. A "Mobile and desktop applications" registration is a public client by default, so no extra toggle is needed.

> What you must **not** use:
> - **Web without "Allow public client flows = Yes"** → Entra demands a client secret the extension cannot safely ship.
> - **Single-page application (SPA)** → Microsoft caps SPA refresh tokens at ~24 hours, forcing users to sign in again daily.

## Step 2: Configure API Permissions

1. In the app registration, go to **API permissions** → **Add a permission**
2. Select **Azure DevOps** → **Delegated permissions**
3. Select the **delegated, read-only** permission(s) the extension needs for Azure DevOps. The extension requests the granular read scopes (`vso.work`, `vso.code`, `vso.build`). Depending on the portal, Azure DevOps is offered with these granular scopes or only with the single delegated permission (`user_impersonation`). Select the granular `vso.*` scopes when they are available; if your portal only offers `user_impersonation`, that registration cannot authorize the extension's request — use the pre-configured default Client ID instead, or the Browser session / PAT methods (see the README).

4. **No Microsoft Graph permission is required.** `openid` and `offline_access` are standard OAuth scopes requested at runtime and do not need to be added in the portal. The extension never calls Microsoft Graph.
5. Click **Add permissions**
6. Click **Grant admin consent for [Your Tenant Name]** — needed so company employees do not see a per-user approval prompt. (Individual users can self-consent when admin consent has not been granted.)

🔐 **What these permissions allow (read-only):**
- **Work Items (Read)** - View Azure DevOps work items
- **Code (Read)** - Access repositories
- **Build (Read)** - View build pipelines and status

## Step 3: Get Client ID

1. In the app registration, go to **Overview**
2. Copy **Application (client) ID** — this is what you share with users
3. Do NOT copy the Object ID (that's different)

**Example Client ID format:**
```
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Step 4: Distribute the Client ID

**For companies:** Share the Client ID with your IT admin. The first employee who signs in triggers the admin approval prompt; after the admin approves, all employees can sign in immediately. Remember that each employee's work/school account must also be a member of the Azure DevOps organization/project they configure.

**For individual work/school users:** Share the Client ID. Users whose work/school account is a member of the Azure DevOps organization sign in directly (self-service consent, no admin approval needed).

**For personal-account users:** This OAuth flow does not work with personal Microsoft accounts. Direct them to the **Browser session** method (recommended) or the **PAT** method in the extension — see the README.

## Summary Checklist

### App Registration Setup
- [ ] Created App Registration in Entra ID
- [ ] Selected the right account type (single-tenant or multi-tenant)
- [ ] Registered redirect URI: **Web + "Allow public client flows = Yes"** (or **Public client/native** if the portal accepts it): `https://<extension-id>.chromiumapp.org/`
- [ ] Configured Azure DevOps delegated read permission(s): granular `vso.*` scopes (required by the extension) if the portal offers them; otherwise use the default Client ID or the Browser session / PAT methods
- [ ] Granted admin consent in your tenant
- [ ] Copied Client ID

### Configuration & Security
- [ ] Set appropriate token lifetime (1 hour recommended)
- [ ] Configured Conditional Access/MFA if needed
- [ ] Enabled audit logging for compliance
- [ ] Tested with a work/school user from a different company

### Testing
- [ ] Tested company employee sign-in (admin consent flow)
- [ ] Tested individual work/school user sign-in (direct login)
- [ ] Confirmed personal Microsoft accounts are rejected with "work or school account required" (expected behavior — personal accounts should use Browser session or PAT)
