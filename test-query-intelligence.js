#!/usr/bin/env node
/**
 * Test Script for Enhanced Query Intelligence Agent
 * Tests the new Chain of Thought prompting and simplified intent classification
 */

const { QueryIntelligenceAgent } = require('./lib/agents/query-intelligence.ts');

async function testQueryIntelligence() {
  console.log('🧠 Testing Enhanced Query Intelligence Agent');
  console.log('=' .repeat(60));

  const config = {
    google_ai_api_key: process.env.GEMINI_API_KEY || ''
  };

  if (!config.google_ai_api_key) {
    console.error('❌ GEMINI_API_KEY not found in environment variables');
    process.exit(1);
  }

  const agent = new QueryIntelligenceAgent(config.google_ai_api_key);

  const testQueries = [
    {
      name: "Simple Treatment Query",
      query: "What is the first-line treatment for T2DM?",
      expectedIntent: "clinical_decision"
    },
    {
      name: "Drug Comparison Query", 
      query: "Compare apixaban vs rivaroxaban for AF with CKD",
      expectedIntent: "clinical_decision"
    },
    {
      name: "Mechanism Query",
      query: "How does metformin work in diabetes?",
      expectedIntent: "education"
    },
    {
      name: "Dosing Query",
      query: "Lisinopril dosing in renal impairment",
      expectedIntent: "drug_information"
    },
    {
      name: "Diagnostic Query",
      query: "Diagnostic criteria for diabetic nephropathy",
      expectedIntent: "diagnostics"
    }
  ];

  for (const test of testQueries) {
    console.log(`\n🔍 Testing: ${test.name}`);
    console.log(`Query: "${test.query}"`);
    console.log(`Expected Intent: ${test.expectedIntent}`);
    console.log('-'.repeat(40));

    try {
      const traceContext = {
        traceId: `test_${Date.now()}`,
        sessionId: 'test_session',
        timestamp: Date.now()
      };

      const startTime = Date.now();
      const result = await agent.analyzeQuery(test.query, traceContext);
      const latency = Date.now() - startTime;

      if (result.success) {
        const analysis = result.data;
        
        console.log(`✅ Success (${latency}ms)`);
        console.log(`Intent: ${analysis.intent} ${analysis.intent === test.expectedIntent ? '✓' : '✗'}`);
        console.log(`Entities:`);
        console.log(`  Diseases: ${analysis.entities.diseases.join(', ') || 'none'}`);
        console.log(`  Drugs: ${analysis.entities.drugs.join(', ') || 'none'}`);
        console.log(`  Procedures: ${analysis.entities.procedures.join(', ') || 'none'}`);
        console.log(`Abbreviations Expanded: ${Object.keys(analysis.abbreviations_expanded).length}`);
        Object.entries(analysis.abbreviations_expanded).forEach(([abbr, expansion]) => {
          console.log(`  ${abbr} → ${expansion}`);
        });
        console.log(`Search Variants: ${analysis.search_variants.length}`);
        analysis.search_variants.forEach((variant, i) => {
          console.log(`  ${i + 1}. ${variant}`);
        });
        console.log(`Required Sources:`);
        Object.entries(analysis.requires_sources).forEach(([source, required]) => {
          console.log(`  ${source}: ${required ? '✓' : '✗'}`);
        });
        console.log(`Complexity Score: ${analysis.complexity_score.toFixed(2)}`);
        console.log(`Cost: $${(result.cost_usd || 0).toFixed(4)}`);

        // Validate the response
        const issues = [];
        if (analysis.search_variants.length < 3 || analysis.search_variants.length > 5) {
          issues.push(`Wrong number of search variants: ${analysis.search_variants.length} (expected 3-5)`);
        }
        if (analysis.complexity_score < 0 || analysis.complexity_score > 1) {
          issues.push(`Invalid complexity score: ${analysis.complexity_score} (expected 0-1)`);
        }
        if (!['clinical_decision', 'education', 'drug_information', 'diagnostics'].includes(analysis.intent)) {
          issues.push(`Invalid intent: ${analysis.intent}`);
        }

        if (issues.length > 0) {
          console.log(`⚠️  Issues found:`);
          issues.forEach(issue => console.log(`   - ${issue}`));
        } else {
          console.log(`🎉 All validations passed!`);
        }

      } else {
        console.log(`❌ Failed: ${result.error}`);
        console.log(`Latency: ${latency}ms`);
      }

    } catch (error) {
      console.error(`💥 Exception: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 Query Intelligence Agent Test Complete');
}

// Run the test
testQueryIntelligence()
  .then(() => {
    console.log('✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });