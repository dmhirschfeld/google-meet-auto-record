#!/usr/bin/env node
/**
 * Sync manifest files - keeps manifest.json, manifest.dev.json, and manifest.prod.json in sync
 * Only the client_id field differs between them
 */

const fs = require('fs');
const path = require('path');

const DEV_CLIENT_ID = '24735518815-8lse7s589gt3afro7270gnoq4ep45s0b.apps.googleusercontent.com';
const PROD_CLIENT_ID = '24735518815-d1gqpv71khb43rniq4fb23iuv5bqnsvm.apps.googleusercontent.com';

function syncManifests(sourceFile, targetFiles) {
  try {
    const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    
    // Extract client_id from source
    const sourceClientId = source.oauth2?.client_id;
    
    // Create base manifest without client_id
    const baseManifest = { ...source };
    
    // Sync to each target file
    targetFiles.forEach(({ file, clientId, description }) => {
      const manifest = JSON.parse(JSON.stringify(baseManifest));
      manifest.oauth2.client_id = clientId;
      
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
      console.log(`✓ Synced ${description} (${file})`);
    });
    
    console.log('\n✅ All manifest files synced successfully!');
    console.log(`   Source: ${sourceFile}`);
    console.log(`   Dev client ID: ${DEV_CLIENT_ID.substring(0, 30)}...`);
    console.log(`   Prod client ID: ${PROD_CLIENT_ID.substring(0, 30)}...`);
    
  } catch (error) {
    console.error('❌ Error syncing manifests:', error.message);
    process.exit(1);
  }
}

// Sync from manifest.json (dev is the default)
const sourceFile = path.join(__dirname, 'manifest.json');
const targetFiles = [
  { file: path.join(__dirname, 'manifest.dev.json'), clientId: DEV_CLIENT_ID, description: 'Dev' },
  { file: path.join(__dirname, 'manifest.prod.json'), clientId: PROD_CLIENT_ID, description: 'Prod' }
];

syncManifests(sourceFile, targetFiles);

