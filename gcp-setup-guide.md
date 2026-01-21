# Google Cloud Setup Guide for Open Work (Limitless.ai)

## Prerequisites

1. **Google Cloud Project**: `limitless-ai`
2. **Indian Guidelines Bucket**: Contains 120+ PDF treatment guidelines
3. **Firestore Database**: For vector embeddings and metadata

## Step 1: Service Account Setup

### Create Service Account
```bash
# Set project
gcloud config set project limitless-ai

# Create service account
gcloud iam service-accounts create open-work-service \
    --display-name="Open Work Medical AI Service Account" \
    --description="Service account for Open Work medical research platform"

# Get service account email
export SERVICE_ACCOUNT_EMAIL="open-work-service@limitless-ai.iam.gserviceaccount.com"
```

### Grant Required Permissions
```bash
# Storage permissions (for Indian guidelines bucket)
gcloud projects add-iam-policy-binding limitless-ai \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/storage.objectViewer"

# Firestore permissions (for vector database)
gcloud projects add-iam-policy-binding limitless-ai \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/datastore.user"

# Vertex AI permissions (for embeddings)
gcloud projects add-iam-policy-binding limitless-ai \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/aiplatform.user"

# Cloud Logging permissions (for observability)
gcloud projects add-iam-policy-binding limitless-ai \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/logging.logWriter"
```

### Download Service Account Key
```bash
# Create and download key
gcloud iam service-accounts keys create gcp-service-account.json \
    --iam-account="${SERVICE_ACCOUNT_EMAIL}"

# Move to project root
mv gcp-service-account.json /path/to/your/project/
```

## Step 2: Verify Bucket Access

### Check Indian Guidelines Bucket
```bash
# List bucket contents
gsutil ls gs://limitless-ai-indian-guidelines/

# Expected output: ~120 PDF files
# gs://limitless-ai-indian-guidelines/guideline-001.pdf
# gs://limitless-ai-indian-guidelines/guideline-002.pdf
# ...
```

### Verify Bucket Structure
```bash
# Check bucket metadata
gsutil ls -L gs://limitless-ai-indian-guidelines/

# Recommended structure:
# /guidelines/
#   ├── cardiology/
#   ├── endocrinology/
#   ├── nephrology/
#   ├── pulmonology/
#   └── general-medicine/
```

## Step 3: Firestore Database Setup

### Enable Firestore API
```bash
gcloud services enable firestore.googleapis.com
```

### Create Firestore Collections
The application will automatically create these collections:

1. **`indian_treatment_guidelines`** - Full guideline documents
2. **`guideline_chunks`** - Chunked text with embeddings

### Sample Document Structure

**Collection: `indian_treatment_guidelines`**
```json
{
  "guideline_id": "icmr-diabetes-2024",
  "title": "ICMR Guidelines for Management of Type 2 Diabetes Mellitus",
  "organization": "Indian Council of Medical Research",
  "year": 2024,
  "specialty": "endocrinology",
  "file_path": "gs://limitless-ai-indian-guidelines/icmr-diabetes-2024.pdf",
  "total_pages": 156,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Collection: `guideline_chunks`**
```json
{
  "chunk_id": "icmr-diabetes-2024-chunk-001",
  "guideline_id": "icmr-diabetes-2024",
  "title": "ICMR Guidelines for Management of Type 2 Diabetes Mellitus",
  "organization": "Indian Council of Medical Research",
  "year": 2024,
  "section": "Treatment Algorithm",
  "page_number": 45,
  "text": "For patients with newly diagnosed Type 2 diabetes mellitus...",
  "embedding": [0.123, -0.456, 0.789, ...], // 768-dimensional vector
  "chunk_index": 1,
  "created_at": "2024-01-15T10:30:00Z"
}
```

## Step 4: Enable Required APIs

```bash
# Enable all required Google Cloud APIs
gcloud services enable \
    storage.googleapis.com \
    firestore.googleapis.com \
    aiplatform.googleapis.com \
    logging.googleapis.com \
    monitoring.googleapis.com
```

## Step 5: Test Connection

Create a test script to verify everything works:

```python
# test-gcp-connection.py
import os
from google.cloud import storage
from google.cloud import firestore
import google.generativeai as genai

def test_gcp_connection():
    """Test Google Cloud connection and services"""
    
    # Test 1: Storage access
    try:
        client = storage.Client()
        bucket = client.bucket('limitless-ai-indian-guidelines')
        blobs = list(bucket.list_blobs(max_results=5))
        print(f"✅ Storage: Found {len(blobs)} files in guidelines bucket")
    except Exception as e:
        print(f"❌ Storage error: {e}")
    
    # Test 2: Firestore access
    try:
        db = firestore.Client()
        collections = list(db.collections())
        print(f"✅ Firestore: Connected, found {len(collections)} collections")
    except Exception as e:
        print(f"❌ Firestore error: {e}")
    
    # Test 3: Gemini API
    try:
        genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
        model = genai.GenerativeModel('gemini-3.0-flash-thinking-exp-01-21')
        response = model.generate_content("Test connection")
        print(f"✅ Gemini: Connected, response length: {len(response.text)}")
    except Exception as e:
        print(f"❌ Gemini error: {e}")

if __name__ == "__main__":
    test_gcp_connection()
```

Run the test:
```bash
python test-gcp-connection.py
```

## Step 6: Environment Variables Checklist

Ensure these are set in your `.env.local`:

- [x] `GOOGLE_CLOUD_PROJECT_ID=limitless-ai`
- [x] `GOOGLE_CLOUD_STORAGE_BUCKET=limitless-ai-indian-guidelines`
- [x] `GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json`
- [x] `GEMINI_API_KEY=your_api_key`
- [x] `GEMINI_PRO_MODEL=gemini-3.0-pro-exp-02-05`
- [x] `GEMINI_FLASH_MODEL=gemini-3.0-flash-thinking-exp-01-21`

## Step 7: Security Best Practices

1. **Never commit service account keys** to version control
2. **Add to .gitignore**:
   ```
   gcp-service-account.json
   .env.local
   ```
3. **Rotate keys regularly** (every 90 days)
4. **Use least privilege** principle for IAM roles
5. **Enable audit logging** for all API calls

## Troubleshooting

### Common Issues

1. **"Permission denied" errors**
   - Check service account has correct IAM roles
   - Verify `GOOGLE_APPLICATION_CREDENTIALS` path is correct

2. **"Bucket not found" errors**
   - Confirm bucket name: `limitless-ai-indian-guidelines`
   - Check bucket exists in correct project

3. **Firestore connection issues**
   - Ensure Firestore is enabled in Native mode
   - Check service account has `datastore.user` role

4. **Gemini API errors**
   - Verify API key is valid and has quota
   - Confirm using only Gemini 3.0 models

### Support Commands

```bash
# Check current project
gcloud config get-value project

# List service accounts
gcloud iam service-accounts list

# Check API status
gcloud services list --enabled

# View logs
gcloud logging read "resource.type=gcs_bucket" --limit=10
```

## Next Steps

1. Run the test script to verify all connections
2. Initialize the vector database with Indian guidelines
3. Test the complete 7-agent pipeline
4. Set up monitoring and alerting
5. Deploy to production environment

---

**Important**: This setup prioritizes Indian treatment guidelines as the primary data source, with PubMed as secondary, exactly as specified in your requirements.