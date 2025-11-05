# Manifest File Sync

This project uses three manifest files that are kept in sync:

- `manifest.json` - Default development manifest (uses dev client ID)
- `manifest.dev.json` - Development manifest with dev OAuth client ID
- `manifest.prod.json` - Production manifest with prod OAuth client ID

## Client IDs

- **Dev**: `24735518815-8lse7s589gt3afro7270gnoq4ep45s0b.apps.googleusercontent.com`
- **Prod**: `24735518815-d1gqpv71khb43rniq4fb23iuv5bqnsvm.apps.googleusercontent.com`

## Syncing Manifests

When you make changes to `manifest.json`, run the sync script to update all three files:

### PowerShell (Windows):
```powershell
.\sync-manifests.ps1
```

### Node.js:
```bash
node sync-manifests.js
```

The script will:
1. Read `manifest.json` as the source
2. Create `manifest.dev.json` with the dev client ID
3. Create `manifest.prod.json` with the prod client ID
4. Keep all other fields identical

## Usage

- **Development**: Use `manifest.json` or `manifest.dev.json` (they're identical)
- **Production**: Copy `manifest.prod.json` to `manifest.json` before building/packaging

## Note

Only the `oauth2.client_id` field differs between the files. All other fields remain identical across all three manifests.

