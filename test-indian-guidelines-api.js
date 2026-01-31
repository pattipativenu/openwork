#!/usr/bin/env node
/**
 * Test Indian Guidelines Integration via API
 */

async function testIndianGuidelinesAPI() {
    console.log('🇮🇳 Testing Indian Guidelines Integration via API');
    console.log('=' .repeat(60));
    
    // Test queries that should trigger Indian Guidelines
    const testQueries = [
        "Type 2 diabetes management guidelines in India",
        "ICMR recommendations for hypertension treatment", 
        "Indian guidelines for COVID-19 management"
    ];
    
    try {
        // Import node-fetch
        const fetch = (await import('node-fetch')).default;
        
        for (const query of testQueries) {
            console.log(`\n🔍 Testing: "${query}"`);
            console.log('-' .repeat(40));
            
            const startTime = Date.now();
            
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [
                        { role: 'user', content: query }
                    ],
                    mode: 'doctor',
                    sessionId: `test_guidelines_${Date.now()}`
                })
            });
            
            if (!response.ok) {
                console.log(`❌ API Error: ${response.status}`);
                const errorText = await response.text();
                console.log('Error details:', errorText);
                continue;
            }
            
            // Process streaming response
            let fullResponse = '';
            let citationsCount = 0;
            let sourcesCount = 0;
            let hasIndianGuidelines = false;
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') break;
                        
                        try {
                            const parsed = JSON.parse(data);
                            
                            if (parsed.content) {
                                fullResponse += parsed.content;
                                
                                // Check for Indian Guidelines content
                                if (parsed.content.includes('Indian Guidelines') || 
                                    parsed.content.includes('ICMR') || 
                                    parsed.content.includes('RSSDI')) {
                                    hasIndianGuidelines = true;
                                }
                            }
                            
                            if (parsed.citations) {
                                citationsCount = parsed.citations.length;
                            }
                            
                            if (parsed.sources_count !== undefined) {
                                sourcesCount = parsed.sources_count;
                            }
                            
                        } catch (parseError) {
                            // Ignore parse errors for partial chunks
                        }
                    }
                }
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Analyze results
            console.log(`✅ Response received (${duration}ms)`);
            console.log(`📊 Response length: ${fullResponse.length} chars`);
            console.log(`📚 Citations: ${citationsCount}`);
            console.log(`🔍 Sources: ${sourcesCount}`);
            console.log(`🇮🇳 Indian Guidelines detected: ${hasIndianGuidelines ? 'YES' : 'NO'}`);
            
            // Show first 300 chars of response
            console.log('\n📄 Response preview:');
            console.log(fullResponse.substring(0, 300) + '...');
            
            // Check for specific Indian content
            const indianKeywords = ['Indian Guidelines', 'ICMR', 'RSSDI', 'Indian', 'India'];
            const foundKeywords = indianKeywords.filter(keyword => 
                fullResponse.toLowerCase().includes(keyword.toLowerCase())
            );
            
            if (foundKeywords.length > 0) {
                console.log(`🎯 Indian content keywords found: ${foundKeywords.join(', ')}`);
            }
            
            console.log('\n' + '=' .repeat(40));
        }
        
        console.log('\n🏁 Indian Guidelines API test completed!');
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

// Check if node-fetch is available and install if needed
async function ensureNodeFetch() {
    try {
        await import('node-fetch');
        return true;
    } catch (error) {
        console.log('📦 Installing node-fetch...');
        const { spawn } = require('child_process');
        
        const install = spawn('npm', ['install', 'node-fetch'], { 
            stdio: 'inherit', 
            shell: true 
        });
        
        return new Promise((resolve) => {
            install.on('close', (code) => {
                resolve(code === 0);
            });
        });
    }
}

async function main() {
    console.log('🧪 Indian Guidelines Integration Test');
    console.log('Testing via Next.js API endpoint');
    console.log();
    
    // Ensure dependencies
    const fetchReady = await ensureNodeFetch();
    if (!fetchReady) {
        console.log('❌ Failed to install node-fetch');
        process.exit(1);
    }
    
    // Run the test
    const success = await testIndianGuidelinesAPI();
    process.exit(success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    });
}

module.exports = { testIndianGuidelinesAPI };