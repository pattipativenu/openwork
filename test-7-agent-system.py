#!/usr/bin/env python3
"""
Test Script for 7-Agent Medical Evidence Synthesis System
Tests the 10th query from openevidence.md
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv('.env.local')

# Add the lib directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'lib'))

async def test_7_agent_system():
    """Test the 7-agent system with the 10th query from openevidence.md"""
    
    # The 10th query from openevidence.md
    test_query = """In severe asthma with eosinophilic phenotype and frequent exacerbations despite high‑dose ICS/LABA, how should clinicians choose between mepolizumab, benralizumab, dupilumab, and tezepelumab based on biomarker profiles (eosinophils, FeNO, IgE), comorbidities, and head‑to‑head or indirect comparative evidence?"""
    
    print("🚀 Testing 7-Agent Medical Evidence Synthesis System")
    print("=" * 80)
    print(f"📋 Test Query: {test_query}")
    print("=" * 80)
    print(f"⏰ Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    try:
        # Import the orchestrator
        from lib.agents.medical_evidence_orchestrator import MedicalEvidenceOrchestrator
        
        # Initialize with environment variables
        config = {
            'google_ai_api_key': os.getenv('GEMINI_API_KEY'),
            'ncbi_api_key': os.getenv('NCBI_API_KEY', ''),
            'tavily_api_key': os.getenv('TAVILY_API_KEY', '')
        }
        
        # Validate configuration
        if not config['google_ai_api_key']:
            raise ValueError("GEMINI_API_KEY environment variable is required")
        
        print("🔧 Initializing 7-Agent Medical Evidence Orchestrator...")
        orchestrator = MedicalEvidenceOrchestrator(config)
        
        print("✅ Orchestrator initialized successfully")
        print()
        
        # Process the query
        print("🎯 Processing query through 7-agent system...")
        session_id = f"test_session_{int(datetime.now().timestamp())}"
        
        response = await orchestrator.processQuery(test_query, session_id)
        
        print("\n" + "=" * 80)
        print("📊 FINAL RESULTS")
        print("=" * 80)
        
        # Display results
        print(f"✅ Synthesis Length: {len(response['synthesis'])} characters")
        print(f"📚 Citations Count: {len(response['citations'])}")
        print(f"🔍 Sources Count: {response['metadata']['sources_count']}")
        print(f"⏱️  Total Latency: {response['metadata']['latency_total_ms']}ms")
        print(f"💰 Total Cost: ${response['metadata']['cost_total_usd']:.4f}")
        print(f"🎯 Grounding Score: {response['metadata']['grounding_score']:.2f}")
        print(f"🤖 Model Used: {response['metadata']['model_used']}")
        print(f"🆔 Trace ID: {response['metadata']['trace_id']}")
        
        if response['metadata']['hallucination_detected']:
            print("⚠️  Hallucination Detected: YES")
        else:
            print("✅ Hallucination Detected: NO")
        
        print("\n" + "-" * 40)
        print("📝 SYNTHESIS PREVIEW (First 500 chars):")
        print("-" * 40)
        print(response['synthesis'][:500] + "..." if len(response['synthesis']) > 500 else response['synthesis'])
        
        print("\n" + "-" * 40)
        print("📚 CITATIONS:")
        print("-" * 40)
        for i, citation in enumerate(response['citations'][:5], 1):  # Show first 5 citations
            print(f"{i}. {citation['title'][:80]}...")
            print(f"   Source: {citation['source']} | ID: {citation['id']}")
            if citation.get('url'):
                print(f"   URL: {citation['url']}")
            print()
        
        if len(response['citations']) > 5:
            print(f"... and {len(response['citations']) - 5} more citations")
        
        if response.get('warning'):
            print("\n⚠️  WARNING:")
            print(response['warning'])
        
        print("\n" + "=" * 80)
        print("🎉 TEST COMPLETED SUCCESSFULLY!")
        print("=" * 80)
        
        return True
        
    except ImportError as e:
        print(f"❌ Import Error: {e}")
        print("💡 Make sure the 7-agent system is properly installed")
        return False
        
    except Exception as e:
        print(f"❌ Test Failed: {e}")
        print(f"📋 Error Type: {type(e).__name__}")
        import traceback
        print("📋 Full Traceback:")
        traceback.print_exc()
        return False

def main():
    """Main function to run the test"""
    print("🧪 7-Agent Medical Evidence Synthesis System Test")
    print("Testing with Query #10 from openevidence.md")
    print()
    
    # Check environment variables
    required_vars = ['GEMINI_API_KEY']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        print("\n💡 Please set these variables in your .env.local file")
        return False
    
    # Run the async test
    try:
        result = asyncio.run(test_7_agent_system())
        return result
    except KeyboardInterrupt:
        print("\n⏹️  Test interrupted by user")
        return False
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)