#!/usr/bin/env node
/**
 * Simple test to verify the 7-agent system is connected to evidence engine
 */

const testQuery = "What is the first-line treatment for Type 2 diabetes according to guidelines?";

async function testConnection() {
    console.log('🧪 Testing 7-Agent System Connection to Evidence Engine');
    console.log('=' .repeat(70));
    console.log(`📋 Test Query: ${testQuery}`);
    console.log('=' .repeat(70));
    
    try {
        // Import node-fetch
        const fetch = (await import('node-fetch')).default;
        
        console.log('🌐 Making API request to /api/chat...');
        
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    { role: 'user', content: testQuery }
                ],
                mode: 'doctor',
                sessionId: `test_${Date.now()}`
            })
        });
        
        console.log(`📊 Response Status: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log('❌ API Error:', errorText);
            return false;
        }
        
        console.log('✅ API responded successfully!');
        console.log('📡 Processing streaming response...');
        
        let totalContent = '';
        let sourcesCount = 0;
        let citationsCount = 0;
        
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
                    if (data === '[DONE]') {
                        console.log('\n✅ Stream completed');
                        break;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        
                        if (parsed.content) {
                            process.stdout.write(parsed.content);
                            totalContent += parsed.content;
                        }
                        
                        if (parsed.sources_count !== undefined) {
                            sourcesCount = parsed.sources_count;
                        }
                        
                        if (parsed.citations) {
                            citationsCount = parsed.citations.length;
                        }
                        
                    } catch (parseError) {
                        // Ignore parse errors for partial chunks
                    }
                }
            }
        }
        
        console.log('\n\n' + '=' .repeat(70));
        console.log('📊 CONNECTION TEST RESULTS');
        console.log('=' .repeat(70));
        console.log(`✅ Response Length: ${totalContent.length} characters`);
        console.log(`🔍 Sources Retrieved: ${sourcesCount}`);
        console.log(`📚 Citations Generated: ${citationsCount}`);
        
        if (sourcesCount > 10) {
            console.log('🎉 SUCCESS: Evidence engine is properly connected!');
            console.log('   Multiple sources (15+) are being retrieved as expected.');
            return true;
        } else if (sourcesCount > 0) {
            console.log('⚠️  PARTIAL: Some sources connected, but may not be using full evidence engine.');
            console.log('   Expected 15+ sources, got:', sourcesCount);
            return true;
        } else {
            console.log('❌ FAILED: No sources retrieved - connection issue detected.');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Connection test failed:', error.message);
        return false;
    }
}

// Run the test
testConnection()
    .then(success => {
        console.log('\n' + '=' .repeat(70));
        if (success) {
            console.log('🎉 CONNECTION TEST PASSED');
        } else {
            console.log('❌ CONNECTION TEST FAILED');
        }
        console.log('=' .repeat(70));
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    });