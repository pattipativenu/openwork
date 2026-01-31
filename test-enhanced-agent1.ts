/**
 * Test Enhanced Agent 1: Query Intelligence with Sub-Agent Optimization
 * Validates the new sub-agent routing and specialized query generation
 */

import { QueryIntelligenceAgent } from './lib/agents/query-intelligence';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

async function testEnhancedAgent1() {
  console.log('🧪 Testing Enhanced Agent 1: Query Intelligence with Sub-Agent Optimization\n');

  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment variables');
    return;
  }

  const agent = new QueryIntelligenceAgent(process.env.GEMINI_API_KEY);
  
  const testQueries = [
    {
      name: "Guidelines Query",
      query: "What are the ICMR guidelines for T2DM first-line treatment?",
      expectedRouting: {
        guidelines: true,
        pubmed: true,
        dailymed: false
      }
    },
    {
      name: "Drug Information Query", 
      query: "Metformin XR dosing in CKD patients with contraindications",
      expectedRouting: {
        guidelines: false,
        pubmed: true,
        dailymed: true
      }
    }
  ];

  for (const testCase of testQueries) {
    console.log(`\n📋 Testing: ${testCase.name}`);
    console.log(`Query: "${testCase.query}"`);
    
    try {
      const traceContext = {
        traceId: `test_${Date.now()}`,
        sessionId: 'test_session',
        timestamp: Date.now()
      };

      const result = await agent.analyzeQuery(testCase.query, traceContext);
      
      if (!result.success) {
        console.error(`❌ Failed: ${result.error}`);
        continue;
      }

      const analysis = result.data;
      
      // Validate basic structure
      console.log(`✅ Intent: ${analysis.intent}`);
      console.log(`✅ Complexity: ${analysis.complexity_score.toFixed(2)}`);
      console.log(`✅ Search variants: ${analysis.search_variants.length}`);
      
      // Validate sub-agent routing
      console.log(`\n🎯 Sub-Agent Routing:`);
      
      if (analysis.sub_agent_queries?.guidelines) {
        console.log(`   📚 Guidelines: ${analysis.sub_agent_queries.guidelines.should_call ? '✓' : '✗'}`);
        console.log(`      Reasoning: ${analysis.sub_agent_queries.guidelines.reasoning}`);
      }
      
      if (analysis.sub_agent_queries?.pubmed) {
        console.log(`   🔬 PubMed: ${analysis.sub_agent_queries.pubmed.should_call ? '✓' : '✗'}`);
        console.log(`      Reasoning: ${analysis.sub_agent_queries.pubmed.reasoning}`);
      }
      
      if (analysis.sub_agent_queries?.dailymed) {
        console.log(`   💊 DailyMed: ${analysis.sub_agent_queries.dailymed.should_call ? '✓' : '✗'}`);
        console.log(`      Reasoning: ${analysis.sub_agent_queries.dailymed.reasoning}`);
      }
      
      // Performance metrics
      console.log(`\n📊 Performance:`);
      console.log(`   Latency: ${result.latency_ms}ms`);
      console.log(`   Cost: $${result.cost_usd?.toFixed(4) || '0.0000'}`);
      
    } catch (error) {
      console.error(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    console.log('\n' + '='.repeat(80));
  }
  
  console.log('\n🎉 Enhanced Agent 1 testing complete!');
}

// Run the test
testEnhancedAgent1().catch(console.error);