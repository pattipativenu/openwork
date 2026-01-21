#!/usr/bin/env python3
"""
Simple test of Google Cloud connection using HTTP requests
Avoids the need to install google-cloud libraries initially
"""

import os
import json
import urllib.request
import urllib.parse
import ssl
from pathlib import Path

# Fix SSL certificate issues on macOS
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

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

def get_access_token():
    """Get access token from ADC"""
    try:
        adc_path = Path.home() / '.config' / 'gcloud' / 'application_default_credentials.json'
        
        if not adc_path.exists():
            return None, "No ADC file found"
        
        with open(adc_path, 'r') as f:
            creds = json.load(f)
        
        if creds.get('type') != 'authorized_user':
            return None, f"Unsupported credential type: {creds.get('type')}"
        
        # For authorized_user, we need to refresh the token
        refresh_token = creds.get('refresh_token')
        client_id = creds.get('client_id')
        client_secret = creds.get('client_secret')
        
        if not all([refresh_token, client_id, client_secret]):
            return None, "Missing required fields in ADC"
        
        # Refresh the access token
        data = {
            'client_id': client_id,
            'client_secret': client_secret,
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token'
        }
        
        data_encoded = urllib.parse.urlencode(data).encode('utf-8')
        
        req = urllib.request.Request(
            'https://oauth2.googleapis.com/token',
            data=data_encoded,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        
        with urllib.request.urlopen(req, context=ssl_context) as response:
            result = json.loads(response.read().decode('utf-8'))
        
        access_token = result.get('access_token')
        if access_token:
            return access_token, "Success"
        else:
            return None, f"No access token in response: {result}"
    
    except Exception as e:
        return None, f"Error getting access token: {e}"

def test_storage_access(access_token, project_id, bucket_name):
    """Test access to Google Cloud Storage bucket"""
    try:
        # List objects in bucket
        url = f"https://storage.googleapis.com/storage/v1/b/{bucket_name}/o"
        
        req = urllib.request.Request(
            url,
            headers={'Authorization': f'Bearer {access_token}'}
        )
        
        with urllib.request.urlopen(req, context=ssl_context) as response:
            result = json.loads(response.read().decode('utf-8'))
        
        items = result.get('items', [])
        return True, f"Found {len(items)} objects in bucket", items[:5]  # Return first 5 items
    
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        try:
            error_json = json.loads(error_body)
            error_msg = error_json.get('error', {}).get('message', error_body)
        except:
            error_msg = error_body
        return False, f"HTTP {e.code}: {error_msg}", []
    
    except Exception as e:
        return False, f"Error: {e}", []

def test_firestore_access(access_token, project_id):
    """Test access to Firestore"""
    try:
        # Test specific document path provided by user
        doc_path = "guideline_chunks/chunk_5cddb209"
        url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/{doc_path}"
        
        req = urllib.request.Request(
            url,
            headers={'Authorization': f'Bearer {access_token}'}
        )
        
        with urllib.request.urlopen(req, context=ssl_context) as response:
            result = json.loads(response.read().decode('utf-8'))
        
        # Check if document exists and has expected fields
        fields = result.get('fields', {})
        doc_name = result.get('name', '')
        
        return True, f"Firestore accessible - found document with {len(fields)} fields", [doc_name]
    
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # Try listing the collection instead
            try:
                collection_url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/guideline_chunks"
                
                req = urllib.request.Request(
                    collection_url,
                    headers={'Authorization': f'Bearer {access_token}'}
                )
                
                with urllib.request.urlopen(req, context=ssl_context) as response:
                    result = json.loads(response.read().decode('utf-8'))
                
                documents = result.get('documents', [])
                return True, f"Firestore accessible - found {len(documents)} documents in guideline_chunks collection", []
            
            except Exception as collection_error:
                return False, f"Document not found and collection listing failed: {collection_error}", []
        else:
            error_body = e.read().decode('utf-8')
            try:
                error_json = json.loads(error_body)
                error_msg = error_json.get('error', {}).get('message', error_body)
            except:
                error_msg = error_body
            return False, f"HTTP {e.code}: {error_msg}", []
    
    except Exception as e:
        return False, f"Error: {e}", []

def test_gemini_api():
    """Test Gemini API access via Google AI Studio"""
    try:
        gemini_key = os.getenv('GEMINI_API_KEY')
        if not gemini_key:
            return False, "No GEMINI_API_KEY found", []
        
        # Test with Gemini 3.0 Flash model via Google AI Studio
        model_name = os.getenv('GEMINI_FLASH_MODEL', 'gemini-3.0-flash-thinking-exp-01-21')
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
        
        data = {
            "contents": [{
                "parts": [{"text": "Hello, respond with exactly: 'Gemini 3.0 Flash working'"}]
            }],
            "generationConfig": {
                "temperature": 0,
                "maxOutputTokens": 20
            }
        }
        
        data_json = json.dumps(data).encode('utf-8')
        
        req = urllib.request.Request(
            url,
            data=data_json,
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req, context=ssl_context) as response:
            result = json.loads(response.read().decode('utf-8'))
        
        candidates = result.get('candidates', [])
        if candidates:
            text = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            return True, f"Gemini 3.0 API working: '{text.strip()}'", []
        else:
            return False, f"No candidates in response: {result}", []
    
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        try:
            error_json = json.loads(error_body)
            error_msg = error_json.get('error', {}).get('message', error_body)
        except:
            error_msg = error_body
        return False, f"HTTP {e.code}: {error_msg}", []
    
    except Exception as e:
        return False, f"Error: {e}", []

def main():
    """Main test function"""
    print("🧪 Testing Google Cloud Connection")
    print("=" * 50)
    
    # Load environment
    load_env_file()
    
    project_id = os.getenv('GOOGLE_CLOUD_PROJECT_ID', 'limitless-ai')
    bucket_name = os.getenv('GOOGLE_CLOUD_STORAGE_BUCKET', 'limitless-ai-indian-guidelines')
    
    print(f"📊 Project ID: {project_id}")
    print(f"🗂️  Bucket: {bucket_name}")
    print()
    
    # Test 1: Get access token
    print("1️⃣ Testing Application Default Credentials...")
    access_token, token_msg = get_access_token()
    
    if access_token:
        print(f"✅ {token_msg}")
        print(f"   Token: {access_token[:20]}...")
    else:
        print(f"❌ {token_msg}")
        return
    
    print()
    
    # Test 2: Storage access
    print("2️⃣ Testing Google Cloud Storage access...")
    storage_success, storage_msg, items = test_storage_access(access_token, project_id, bucket_name)
    
    if storage_success:
        print(f"✅ {storage_msg}")
        if items:
            print("   Sample files:")
            for item in items:
                name = item.get('name', 'Unknown')
                size = item.get('size', 'Unknown')
                print(f"     - {name} ({size} bytes)")
    else:
        print(f"❌ {storage_msg}")
    
    print()
    
    # Test 3: Firestore access
    print("3️⃣ Testing Firestore access...")
    firestore_success, firestore_msg, _ = test_firestore_access(access_token, project_id)
    
    if firestore_success:
        print(f"✅ {firestore_msg}")
    else:
        print(f"❌ {firestore_msg}")
    
    print()
    
    # Test 4: Gemini API
    print("4️⃣ Testing Gemini API access...")
    gemini_success, gemini_msg, _ = test_gemini_api()
    
    if gemini_success:
        print(f"✅ {gemini_msg}")
    else:
        print(f"❌ {gemini_msg}")
    
    print()
    print("🏁 Test Summary:")
    tests = [
        ("ADC Token", access_token is not None),
        ("Storage Access", storage_success),
        ("Firestore Access", firestore_success),
        ("Gemini API", gemini_success)
    ]
    
    passed = sum(1 for _, success in tests if success)
    total = len(tests)
    
    for test_name, success in tests:
        status = "✅" if success else "❌"
        print(f"  {status} {test_name}")
    
    print(f"\n🎯 Result: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All systems ready! You can proceed with embedding the Indian guidelines.")
    else:
        print("⚠️  Some issues found. Please check the errors above.")

if __name__ == "__main__":
    main()