require('dotenv').config({ path: '.env.local' });
const { Firestore } = require('@google-cloud/firestore');
const fs = require('fs');

async function testGCPConnection() {
  console.log('🧪 Testing GCP Firestore Connection...\n');
  
  // Check authentication methods
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const hasEnvVars = process.env.GOOGLE_CLOUD_PROJECT_ID && 
                    process.env.GOOGLE_CLOUD_PRIVATE_KEY && 
                    process.env.GOOGLE_CLOUD_CLIENT_EMAIL;
  
  console.log('📋 Authentication Check:');
  console.log(`   Service account file: ${credentialsPath ? (fs.existsSync(credentialsPath) ? '✅ Found' : '❌ Not found') : '❌ Not configured'}`);
  console.log(`   Environment variables: ${hasEnvVars ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   Project ID: ${process.env.GOOGLE_CLOUD_PROJECT_ID || 'Not set'}`);
  console.log(`   Firestore Database: ${process.env.FIRESTORE_DATABASE_ID || 'Not set'}`);
  console.log(`   Guidelines Collection: ${process.env.FIRESTORE_COLLECTION_GUIDELINE_CHUNKS || 'Not set'}\n`);
  
  if (!credentialsPath && !hasEnvVars) {
    console.log('❌ No GCP credentials configured. Please set up authentication first.');
    console.log('\n📖 See setup-gcp-service-account.md for instructions.');
    return;
  }
  
  try {
    let db;
    
    if (credentialsPath && fs.existsSync(credentialsPath)) {
      console.log('🔑 Using service account file...');
      db = new Firestore();
    } else if (hasEnvVars) {
      console.log('🔑 Using environment variables...');
      db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        credentials: {
          client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }
      });
    }
    
    // Test connection
    console.log('🔄 Testing Firestore connection...');
    const collection = db.collection(process.env.FIRESTORE_COLLECTION_GUIDELINE_CHUNKS || 'guideline_chunks');
    
    // Try to get a few documents
    const snapshot = await collection.limit(3).get();
    
    if (snapshot.empty) {
      console.log('⚠️ Connection successful, but no guidelines found in collection.');
      console.log('   Make sure you have uploaded guidelines to Firestore.');
    } else {
      console.log(`✅ Connection successful! Found ${snapshot.size} sample guidelines.`);
      console.log('\n📄 Sample guidelines:');
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   - ${data.title || 'Untitled'} (${data.organization || 'Unknown org'})`);
      });
    }
    
    console.log('\n🎉 GCP Firestore is properly configured and accessible!');
    
  } catch (error) {
    console.error('❌ GCP connection failed:', error.message);
    
    if (error.message.includes('permission')) {
      console.log('\n💡 This looks like a permissions issue. Make sure your service account has:');
      console.log('   - Firestore User role');
      console.log('   - Firebase Admin role');
    } else if (error.message.includes('project')) {
      console.log('\n💡 This looks like a project configuration issue. Check:');
      console.log('   - Project ID is correct');
      console.log('   - Firestore is enabled in your project');
    }
  }
}

testGCPConnection().catch(console.error);