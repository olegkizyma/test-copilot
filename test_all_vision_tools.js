/**
 * Detailed test for vision tools across all extensions
 */

import { callGooseAgent } from './orchestrator/agents/goose-client.js';

async function testAllVisionTools() {
    console.log('🔍 Testing Vision Tools Across All Extensions...\n');

    // Test developer tools for vision
    console.log('Test 1: Developer extension - checking for vision/screen tools');
    const devPrompt = `List ALL available developer tools, especially any that involve screenshots, screen capture, vision, or image analysis. Be very specific and list every tool you can access.`;

    try {
        const devResponse = await callGooseAgent(devPrompt, 'test_dev_tools', { agent: 'grisha' });
        console.log('Developer tools response:');
        console.log(devResponse.substring(0, 1000) + (devResponse.length > 1000 ? '...' : ''));
    } catch (error) {
        console.error('Developer test failed:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test computercontroller for vision
    console.log('Test 2: Computer Controller - checking for vision/screen tools');
    const compPrompt = `List ALL available computercontroller tools, especially any that involve screenshots, screen capture, vision, or image processing. Be very specific.`;

    try {
        const compResponse = await callGooseAgent(compPrompt, 'test_comp_tools', { agent: 'grisha' });
        console.log('Computer Controller tools response:');
        console.log(compResponse.substring(0, 1000) + (compResponse.length > 1000 ? '...' : ''));
    } catch (error) {
        console.error('Computer Controller test failed:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test vscode extension for vision
    console.log('Test 3: VSCode extension - checking for vision/screen tools');
    const vscodePrompt = `List ALL available vscode tools, especially any that involve screenshots, screen capture, vision, or image analysis. Be very specific.`;

    try {
        const vscodeResponse = await callGooseAgent(vscodePrompt, 'test_vscode_tools', { agent: 'grisha' });
        console.log('VSCode tools response:');
        console.log(vscodeResponse.substring(0, 1000) + (vscodeResponse.length > 1000 ? '...' : ''));
    } catch (error) {
        console.error('VSCode test failed:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test direct screen capture attempt
    console.log('Test 4: Direct screen capture test (developer__screen_capture)');
    const screenPrompt = `Try to use developer__screen_capture or any similar screen capture tool. If it doesn't work, explain why and what alternatives you have.`;

    try {
        const screenResponse = await callGooseAgent(screenPrompt, 'test_screen_capture', { agent: 'grisha' });
        console.log('Screen capture test response:');
        console.log(screenResponse);
    } catch (error) {
        console.error('Screen capture test failed:', error.message);
    }
}

// Run the test
testAllVisionTools().catch(console.error);