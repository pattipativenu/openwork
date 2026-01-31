/**
 * Test Indian Guidelines Integration
 * Tests the complete 7-agent system with focus on Indian Guidelines
 */

const { MedicalEvidenceOrchestrator } = require('./lib/agents/medical-evidence-orchestrator');

async function testIndianGuidelines() {
  console.log('🧪 Testing Indian Guidelines Integration...\n');

  const orchestrator = new MedicalEvidenceOrchestrator({
    gemini_api_key: process.env.GEMINI_API_KEY,
    ncbi_api_key: process.env.NCBI_API_KEY,
    tavily_api_key: process.env.TAVILY_API_KEY
  });

  // Test queries that should trigger Indian Guidelines
  const testQueries = [
    "Type 2 diabetes management guidelines in India",
    "ICMR recommendations for hypertension treatment",
    "Indian guidelines for COVID-19 management",
    "RSSDI diabetes treatment protocols"
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 Testing query: "${query}"`);
    console.log('=' .repeat(60));

    try {
      const result = await orchestrator.processQuery(query, {
        session_id: `test-${Date.now()}`,
        user_id: 'test-user'
      });

      if (result.success) {
        const synthesis = result.data.synthesis;
        
        // Check if Indian Guidelines section exists
        const hasIndianGuidelines = synthesis.includes('Indian Guidelines') || 
                                   synthesis.includes('ICMR') || 
                                   synthesis.includes('RSSDI');
        
        console.log(`✅ Query processed successfully`);
        console.log(`📊 Sources found: ${result.data.evidence_pack.length}`);
        console.log(`🇮🇳 Indian Guidelines detected: ${hasIndianGuidelines ? 'YES' : 'NO'}`);
        
        // Count Indian guideline sources
        const indianSources = result.data.evidence_pack.filter(
          item => item.source === 'indian_guideline'
        );
        console.log(`📋 Indian guideline sources: ${indianSources.length}`);
        
        if (indianSources.length > 0) {
          console.log('📝 Indian guideline titles:');
          indianSources.forEach((source, index) => {
            console.log(`   ${index + 1}. ${source.title}`);
            console.log(`      Organization: ${source.metadata.organization || 'Unknown'}`);
            console.log(`      Year: ${source.metadata.year || 'Unknown'}`);
          });
        }
        
        // Show first 200 chars of synthesis
        console.log(`\n📄 Synthesis preview:`);
        console.log(synthesis.substring(0, 200) + '...');
        
      } else {
        console.log(`❌ Query failed: ${result.error}`);
      }
      
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
    }
    
    console.log('\n' + '-'.repeat(60));
  }

  console.log('\n🏁 Indian Guidelines integration test completed!');
}

// Run the test
if (require.main === module) {
  testIndianGuidelines().catch(console.error);
}

module.exports = { testIndianGuidelines };