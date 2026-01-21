#!/usr/bin/env node
/**
 * Test Script for 7-Agent Medical Evidence Synthesis System
 * Tests the 10th query from openevidence.md using Node.js
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// The 10th query from openevidence.md
const testQuery = `In severe asthma with eosinophilic phenotype and frequent exacerbations despite high‑dose ICS/LABA, how should clinicians choose between mepolizumab, benralizumab, dupilumab, and tezepelumab based on biomarker profiles (eosinophils, FeNO, IgE), comorbidities, and head‑to‑head or indirect comparative evidence?`;

console.log('🚀 Testing 7-Agent Medical Evidence Synthesis System');
console.log('=' .repeat(80));
console.log(`📋 Test Query: ${testQuery}`);
console.log('=' .repeat(80));
console.log(`⏰ Start Time: ${new Date().toLocaleString()}`);
console.log();

// Test via API endpoint
async function testViaAPI() {
    console.log('🌐 Testing via Next.js API endpoint...');
    
    try {
        // Start the Next.js development server
        console.log('🔧 Starting Next.js development server...');
        
        const server = spawn('npm', ['run', 'dev'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });
        
        let serverReady = false;
        let serverOutput = '';
        
        // Wait for server to be ready
        server.stdout.on('data', (data) => {
            const output = data.toString();
            serverOutput += output;
            console.log('📡 Server:', output.trim());
            
            if (output.includes('Ready') || output.includes('localhost:3000')) {
                serverReady = true;
            }
        });
        
        server.stderr.on('data', (data) => {
            console.log('⚠️ Server Error:', data.toString().trim());
        });
        
        // Wait for server to be ready (max 30 seconds)
        let waitTime = 0;
        while (!serverReady && waitTime < 30000) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            waitTime += 1000;
            if (waitTime % 5000 === 0) {
                console.log(`⏳ Waiting for server... (${waitTime/1000}s)`);
            }
        }
        
        if (!serverReady) {
            console.log('❌ Server failed to start within 30 seconds');
            server.kill();
            return false;
        }
        
        console.log('✅ Server is ready! Making API request...');
        
        // Make API request
        const fetch = (await import('node-fetch')).default;
        
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
                sessionId: `test_session_${Date.now()}`
            })
        });
        
        console.log(`📊 Response Status: ${response.status}`);
        console.log(`📊 Response Headers:`, Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log('❌ API Error:', errorText);
            server.kill();
            return false;
        }
        
        // Handle streaming response
        console.log('\n🎯 Processing streaming response...');
        console.log('-' .repeat(40));
        
        let fullResponse = '';
        let citationsCount = 0;
        let sourcesCount = 0;
        let cost = 0;
        let latency = 0;
        let groundingScore = 0;
        
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
                            fullResponse += parsed.content;
                        }
                        
                        if (parsed.citations) {
                            citationsCount = parsed.citations.length;
                        }
                        
                        if (parsed.sources_count !== undefined) {
                            sourcesCount = parsed.sources_count;
                            cost = parsed.cost || 0;
                            latency = parsed.latency || 0;
                            groundingScore = parsed.grounding_score || 0;
                        }
                        
                        if (parsed.warning) {
                            console.log(`\n⚠️ Warning: ${parsed.warning}`);
                        }
                        
                    } catch (parseError) {
                        // Ignore parse errors for partial chunks
                    }
                }
            }
        }
        
        console.log('\n\n' + '=' .repeat(80));
        console.log('📊 FINAL RESULTS');
        console.log('=' .repeat(80));
        console.log(`✅ Response Length: ${fullResponse.length} characters`);
        console.log(`📚 Citations Count: ${citationsCount}`);
        console.log(`🔍 Sources Count: ${sourcesCount}`);
        console.log(`⏱️  Total Latency: ${latency}ms`);
        console.log(`💰 Total Cost: $${cost.toFixed(4)}`);
        console.log(`🎯 Grounding Score: ${Math.round(groundingScore * 100)}%`);
        
        console.log('\n🎉 TEST COMPLETED SUCCESSFULLY!');
        console.log('=' .repeat(80));
        
        // Kill the server
        server.kill();
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

// Test via direct TypeScript compilation and execution
async function testViaTypeScript() {
    console.log('🔧 Testing via direct TypeScript execution...');
    
    try {
        // Check if we can compile and run TypeScript directly
        const tsNode = spawn('npx', ['ts-node', '--esm', '-e', `
            import { MedicalEvidenceOrchestrator } from './lib/agents/medical-evidence-orchestrator.js';
            
            const config = {
                google_ai_api_key: process.env.GEMINI_API_KEY || '',
                ncbi_api_key: process.env.NCBI_API_KEY || '',
                tavily_api_key: process.env.TAVILY_API_KEY || ''
            };
            
            const orchestrator = new MedicalEvidenceOrchestrator(config);
            const query = \`${testQuery}\`;
            
            console.log('🚀 Testing orchestrator directly...');
            
            orchestrator.processQuery(query, 'test_session_direct')
                .then(response => {
                    console.log('✅ Direct test successful!');
                    console.log('Response:', JSON.stringify(response, null, 2));
                })
                .catch(error => {
                    console.error('❌ Direct test failed:', error);
                    process.exit(1);
                });
        `], {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env }
        });
        
        return new Promise((resolve) => {
            tsNode.on('close', (code) => {
                resolve(code === 0);
            });
        });
        
    } catch (error) {
        console.error('❌ TypeScript test failed:', error);
        return false;
    }
}

async function main() {
    console.log('🧪 7-Agent Medical Evidence Synthesis System Test');
    console.log('Testing with Query #10 from openevidence.md');
    console.log();
    
    // Check if node-fetch is available
    try {
        await import('node-fetch');
    } catch (error) {
        console.log('📦 Installing node-fetch...');
        const install = spawn('npm', ['install', 'node-fetch'], { stdio: 'inherit', shell: true });
        await new Promise((resolve) => {
            install.on('close', resolve);
        });
    }
    
    // Try API test first
    console.log('🎯 Method 1: Testing via Next.js API...');
    const apiSuccess = await testViaAPI();
    
    if (apiSuccess) {
        console.log('🎉 API test completed successfully!');
        return true;
    }
    
    console.log('\n🎯 Method 2: Testing via direct TypeScript...');
    const tsSuccess = await testViaTypeScript();
    
    if (tsSuccess) {
        console.log('🎉 TypeScript test completed successfully!');
        return true;
    }
    
    console.log('❌ Both test methods failed');
    return false;
}

// Run the test
main()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    });