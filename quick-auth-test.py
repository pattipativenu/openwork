#!/usr/bin/env python3
"""
Quick test to check if we can connect to Google Cloud
without installing packages via pip
"""

import os
import sys

def load_env_file():
    """Load environment variables from .env.local"""
    env_file = '.env.local'
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key] = value
        print("✅ Loaded .env.local file")
    else:
        print("❌ .env.local file not found")

def test_basic_connection():
    """Test basic connection to Google Cloud"""
    
    print("🔍 Testing Google Cloud Connection...")
    
    # Check environment variables
    project_id = os.getenv('GOOGLE_CLOUD_PROJECT_ID')
    bucket_name = os.getenv('GOOGLE_CLOUD_STORAGE_BUCKET')
    gemini_key = os.getenv('GEMINI_API_KEY')
    
    print(f"Project ID: {project_id}")
    print(f"Bucket: {bucket_name}")
    print(f"Gemini API Key: {'✅ Set' if gemini_key else '❌ Missing'}")
    
    # Check for service account key
    if os.path.exists('./gcp-service-account.json'):
        print("✅ Service account key file found")
        
        # Try to read and validate the key
        try:
            import json
            with open('./gcp-service-account.json', 'r') as f:
                key_data = json.load(f)
                
            required_fields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email']
            missing_fields = [field for field in required_fields if field not in key_data]
            
            if missing_fields:
                print(f"⚠️  Key file missing fields: {missing_fields}")
            else:
                print("✅ Service account key file is valid")
                print(f"   Project: {key_data.get('project_id')}")
                print(f"   Email: {key_data.get('client_email')}")
                
                # Check if project matches
                if key_data.get('project_id') != project_id:
                    print(f"⚠️  Project ID mismatch: key has '{key_data.get('project_id')}', env has '{project_id}'")
                
        except Exception as e:
            print(f"❌ Error reading key file: {e}")
    else:
        print("❌ No service account key file found")
    
    print("\n🚀 Ready to proceed once authentication is set up!")

if __name__ == "__main__":
    load_env_file()
    test_basic_connection()