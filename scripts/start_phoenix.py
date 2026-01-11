#!/usr/bin/env python3
"""
Arize Phoenix Local Server Launcher

This script starts the Arize Phoenix observability server locally.
It provides a UI for viewing traces and running evaluations.

Usage:
    python scripts/start_phoenix.py

The server will be available at:
    - UI: http://localhost:6006
    - OTLP Collector: http://localhost:6006/v1/traces
"""

import phoenix as px
import signal
import sys

def main():
    PORT = 6006
    
    print("🚀 Starting Arize Phoenix Server...")
    print(f"   UI: http://localhost:{PORT}")
    print(f"   OTLP Collector: http://localhost:{PORT}/v1/traces")
    print("")
    print("📊 This server receives traces from the MedGuidance-AI application.")
    print("   - View traces: Click on any trace to see the full span tree")
    print("   - View tools: Each tool (Tavily, PubMed, OpenI) appears as a child span")
    print("   - Run evals: Use the Evaluations tab to check for hallucinations")
    print("")
    print("Press Ctrl+C to stop the server.")
    print("=" * 60)
    
    # Launch Phoenix with OTLP enabled
    # This automatically starts both the UI and the trace collector
    session = px.launch_app(host="0.0.0.0", port=PORT)
    
    # Keep the script running until interrupted
    def signal_handler(sig, frame):
        print("\n🛑 Stopping Phoenix server...")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Block forever (Phoenix runs in background thread)
    try:
        signal.pause()
    except AttributeError:
        # Windows doesn't have signal.pause()
        import time
        while True:
            time.sleep(1)

if __name__ == "__main__":
    main()
