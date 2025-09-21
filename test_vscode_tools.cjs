const axios = require('axios');

async function testVSCodeTools() {
    console.log('Testing VSCode tools access for Tetyana and Grisha...');

    try {
        // Test Tetyana
        console.log('Testing Tetyana...');
        const tetyanaResponse = await axios.post('http://localhost:5101/chat/stream', {
            message: 'Створи простий файл test_tetyana_vscode.js з console.log("Tetyana VSCode test");',
            agent: 'tetyana'
        }, { timeout: 30000 });

        console.log('Tetyana test completed');

        // Test Grisha
        console.log('Testing Grisha...');
        const grishaResponse = await axios.post('http://localhost:5101/chat/stream', {
            message: 'Перевір чи створений файл test_tetyana_vscode.js і підтверди його вміст',
            agent: 'grisha'
        }, { timeout: 30000 });

        console.log('Grisha test completed');
        console.log('VSCode tools test successful!');

    } catch (error) {
        console.error('VSCode tools test failed:', error.message);
    }
}

testVSCodeTools();