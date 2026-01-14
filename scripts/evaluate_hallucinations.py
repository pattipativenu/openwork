#!/usr/bin/env python3
"""
Hallucination Evaluation Script for MedGuidance-AI

This script fetches traces from Arize Phoenix and evaluates them for hallucinations.
It uses OpenAI as the "judge" to verify if the AI's response is supported by the
retrieved evidence.

Usage:
    python scripts/evaluate_hallucinations.py

Prerequisites:
    1. Phoenix server running: python scripts/start_phoenix.py
    2. OPENAI_API_KEY set in environment
    3. Some traces collected in Phoenix
"""

import os
import json
from datetime import datetime

# Check for required packages
try:
    import phoenix as px
    from openai import OpenAI
except ImportError as e:
    print(f"❌ Missing required package: {e}")
    print("   Install with: pip install -r requirements.txt")
    exit(1)

# Hallucination Judge Prompt
HALLUCINATION_JUDGE_PROMPT = """You are a strict medical evaluator. Your task is to determine if a medical AI's RESPONSE is fully supported by the RETRIEVED_EVIDENCE.

RETRIEVED_EVIDENCE:
{evidence}

AI_RESPONSE:
{response}

INSTRUCTIONS:
1. Identify every medical claim, recommendation, or statement of fact in the AI_RESPONSE.
2. For each claim, search for supporting evidence in RETRIEVED_EVIDENCE.
3. A claim is a HALLUCINATION if:
   - It contains specific statistics, study results, or numbers NOT in the evidence
   - It recommends treatments, dosages, or procedures NOT supported by the evidence
   - It cites specific guidelines or sources NOT present in the evidence
4. Minor rephrasing or summarization is acceptable if the core meaning is preserved.

OUTPUT:
Respond with a JSON object:
{{
    "is_hallucination": true/false,
    "confidence": 0.0-1.0,
    "hallucinated_claims": ["list of specific hallucinated claims, if any"],
    "supported_claims": ["list of claims that are properly supported"],
    "reasoning": "Brief explanation of your evaluation"
}}

Only output the JSON, no other text.
"""


def get_openai_client():
    """Initialize OpenAI client using environment variable."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set in environment")

    return OpenAI(api_key=api_key)


def evaluate_trace_for_hallucination(trace_data: dict, client) -> dict:
    """
    Evaluate a single trace for hallucinations.
    
    Args:
        trace_data: Dictionary containing 'input', 'output', and 'evidence' fields
        client: OpenAI client
    
    Returns:
        Evaluation result dictionary
    """
    evidence = trace_data.get("evidence", "No evidence retrieved")
    response = trace_data.get("output", "")
    
    if not response:
        return {
            "is_hallucination": False,
            "confidence": 1.0,
            "reasoning": "No response to evaluate"
        }
    
    # Prepare the prompt
    prompt = HALLUCINATION_JUDGE_PROMPT.format(
        evidence=evidence[:10000],  # Truncate for context window
        response=response[:5000]
    )
    
    try:
        # Call OpenAI for evaluation
        result = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0
        )

        # Parse the JSON response
        response_text = (result.choices[0].message.content or "").strip()
        
        # Handle markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        
        evaluation = json.loads(response_text)
        return evaluation
        
    except json.JSONDecodeError as e:
        return {
            "is_hallucination": None,
            "confidence": 0.0,
            "reasoning": f"Failed to parse evaluation response: {e}"
        }
    except Exception as e:
        return {
            "is_hallucination": None,
            "confidence": 0.0,
            "reasoning": f"Evaluation error: {e}"
        }


def fetch_traces_from_phoenix() -> list:
    """
    Fetch recent traces from Phoenix.
    
    Returns:
        List of trace dictionaries with input/output/evidence
    """
    try:
        # Connect to Phoenix
        client = px.Client()
        
        # Get recent spans
        spans = client.get_spans_dataframe()
        
        if spans is None or len(spans) == 0:
            print("📭 No traces found in Phoenix")
            return []
        
        # Filter for chat.interaction spans (root spans)
        chat_spans = spans[spans['name'] == 'chat.interaction']
        
        traces = []
        for _, span in chat_spans.iterrows():
            trace = {
                "trace_id": span.get("trace_id", "unknown"),
                "input": span.get("attributes.input.message", ""),
                "output": span.get("attributes.output.response", ""),
                "evidence": "",  # Will be populated from child spans
                "timestamp": span.get("start_time", datetime.now().isoformat())
            }
            
            # Get child spans for this trace to extract evidence
            trace_id = span.get("trace_id")
            if trace_id:
                child_spans = spans[spans['trace_id'] == trace_id]
                
                # Extract evidence from tool spans
                evidence_parts = []
                for _, child in child_spans.iterrows():
                    if 'tool.' in str(child.get('name', '')):
                        # Get output from tool spans
                        citation_urls = child.get("attributes.output.citation_urls", "")
                        if citation_urls:
                            evidence_parts.append(f"Citations: {citation_urls}")
                        
                        pmid_count = child.get("attributes.output.pmid_count", 0)
                        if pmid_count:
                            evidence_parts.append(f"PubMed results: {pmid_count}")
                
                trace["evidence"] = "\n".join(evidence_parts)
            
            traces.append(trace)
        
        return traces
        
    except Exception as e:
        print(f"❌ Error fetching traces: {e}")
        return []


def main():
    print("=" * 60)
    print("🔍 MedGuidance-AI Hallucination Evaluator")
    print("=" * 60)
    print()
    
    # Initialize OpenAI client
    try:
        client = get_openai_client()
        print("✅ OpenAI client initialized")
    except ValueError as e:
        print(f"❌ {e}")
        return
    
    # Fetch traces from Phoenix
    print("📡 Fetching traces from Phoenix...")
    traces = fetch_traces_from_phoenix()
    
    if not traces:
        print("   No traces to evaluate. Make some queries first!")
        return
    
    print(f"   Found {len(traces)} trace(s) to evaluate")
    print()
    
    # Evaluate each trace
    results = []
    for i, trace in enumerate(traces[:10]):  # Limit to 10 most recent
        print(f"📊 Evaluating trace {i+1}/{min(len(traces), 10)}...")
        print(f"   Input: {trace['input'][:100]}...")
        
        result = evaluate_trace_for_hallucination(trace, client)
        result["trace_id"] = trace["trace_id"]
        result["timestamp"] = trace["timestamp"]
        results.append(result)
        
        if result.get("is_hallucination"):
            print(f"   ⚠️  HALLUCINATION DETECTED (confidence: {result.get('confidence', 'N/A')})")
            if result.get("hallucinated_claims"):
                for claim in result["hallucinated_claims"][:3]:
                    print(f"      - {claim}")
        else:
            print(f"   ✅ Response supported by evidence")
        print()
    
    # Summary
    print("=" * 60)
    print("📈 EVALUATION SUMMARY")
    print("=" * 60)
    
    hallucinations = sum(1 for r in results if r.get("is_hallucination") == True)
    supported = sum(1 for r in results if r.get("is_hallucination") == False)
    unknown = sum(1 for r in results if r.get("is_hallucination") is None)
    
    print(f"   Total traces evaluated: {len(results)}")
    print(f"   ✅ Supported by evidence: {supported}")
    print(f"   ⚠️  Hallucinations detected: {hallucinations}")
    print(f"   ❓ Unable to evaluate: {unknown}")
    
    if len(results) > 0:
        accuracy = supported / len(results) * 100
        print(f"\n   📊 Accuracy rate: {accuracy:.1f}%")
    
    print()


if __name__ == "__main__":
    main()
