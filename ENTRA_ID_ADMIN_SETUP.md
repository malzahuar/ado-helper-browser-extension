# Microsoft Entra ID App Registration Setup Guide

Setup OAuth 2.0 for the ADO Helper extension to support company employees (admin consent flow), individual users (direct sign-in), and multiple organizations with a single app registration.

**Flow:** First employee from a company → admin sees approval prompt → approves once → all other employees get instant access. Individual users sign in directly with personal Microsoft accounts.

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
     - **Multi-Tenant** (recommended for wider use): Select **"Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"** - allows companies AND individual users with one app
     - **Single-Tenant** (internal use only): Select **"Accounts in this organizational directory only"** - allows only your company employees
   - **Redirect URI**: Web
   - **Redirect URI value**: `https://<extension-id>.chromiumapp.org/`. Copy the value from Options page.

5. Click **Register**

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

**For individual users**: Share publicly  
→ Users sign in with personal Microsoft account  
→ No approval needed



## Summary Checklist

### App Registration Setup
- [ ] Created App Registration in Entra ID
- [ ] Selected account type:
  - [ ] Multi-Tenant: "Accounts in any organizational directory + personal Microsoft accounts"
  - [ ] Single-Tenant: "Accounts in this organizational directory only"
- [ ] Added redirect URI: `https://<extension-id>.chromiumapp.org/`
- [ ] Configured Azure DevOps API permissions
- [ ] Verified Microsoft Graph delegated `User.Read` is present
- [ ] Granted admin consent in your tenant
- [ ] Copied Client ID

### Configuration & Security
- [ ] Set appropriate token lifetime (1 hour recommended)
- [ ] Configured Conditional Access/MFA if needed
- [ ] Enabled audit logging for compliance
- [ ] Confirmed baseline delegated sign-in consent is approved by admin policy
- [ ] Tested with personal Microsoft account user
- [ ] Tested with corporate user from different company

### Testing
- [ ] Tested extension with Client ID (personal account)
- [ ] Tested company employee sign-in (admin consent flow)
- [ ] Tested individual user sign-in (direct login)


