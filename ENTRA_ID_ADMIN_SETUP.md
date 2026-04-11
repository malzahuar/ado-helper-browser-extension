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
   - `user_impersonation`
6. Click **Add permissions**

🔐 **What these permissions allow:**
- **Read Work Items** - View Azure DevOps work items
- **Read Code** - Access repositories
- **Read Build** - View build pipelines and status

7. Click **Grant admin consent for [Your Tenant Name]**

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
- [ ] Granted admin consent in your tenant
- [ ] Copied Client ID

### Configuration & Security
- [ ] Set appropriate token lifetime (1 hour recommended)
- [ ] Configured Conditional Access/MFA if needed
- [ ] Enabled audit logging for compliance
- [ ] Tested with personal Microsoft account user
- [ ] Tested with corporate user from different company

### Testing
- [ ] Tested extension with Client ID (personal account)
- [ ] Tested company employee sign-in (admin consent flow)
- [ ] Tested individual user sign-in (direct login)


