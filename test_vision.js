/**
 * Test script for Goose vision capabilities
 */

import { callGooseAgent } from './orchestrator/agents/goose-client.js';

async function testVisionCapabilities() {
    console.log('🧪 Testing Goose Vision Capabilities...\n');

    // Test 1: Check if vision tools are available for Grisha
    console.log('Test 1: Grisha (verifier) - should have vision access');
    const grishaPrompt = `List all available tools you can use, especially any vision or screenshot tools. Be specific about what you can do.`;

    try {
        const grishaResponse = await callGooseAgent(grishaPrompt, 'test_session_grisha', { agent: 'grisha' });
        console.log('Grisha response:', grishaResponse);
    } catch (error) {
        console.error('Grisha test failed:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: Check if vision tools are blocked for Tetyana
    console.log('Test 2: Tetyana (executor) - should NOT have vision access');
    const tetyanaPrompt = `List all available tools you can use. Try to use any vision or screenshot tools if available.`;

    try {
        const tetyanaResponse = await callGooseAgent(tetyanaPrompt, 'test_session_tetyana', { agent: 'tetyana' });
        console.log('Tetyana response:', tetyanaResponse);
    } catch (error) {
        console.error('Tetyana test failed:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 3: Direct vision test with Grisha
    console.log('Test 3: Direct vision test with Grisha');
    const visionPrompt = `Take a screenshot of the current screen and describe what you see. Use any available vision tools.`;

    try {
        const visionResponse = await callGooseAgent(visionPrompt, 'test_session_vision', { agent: 'grisha' });
        console.log('Vision test response:', visionResponse);
    } catch (error) {
        console.error('Vision test failed:', error.message);
    }
}

// Run the test
testVisionCapabilities().catch(console.error);