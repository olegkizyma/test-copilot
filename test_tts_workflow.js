const axios = require('axios');

async function testTTSWorkflow() {
    console.log('Testing TTS workflow with long text...');

    try {
        const response = await axios.post('http://localhost:5101/chat/stream', {
            message: "Скажи щось довге українською мовою для тестування системи синтезу мовлення. Це має бути достатньо довгий текст, щоб перевірити, чи не виникають таймаути при обробці великих обсягів тексту в системі ATLAS.",
            agent: "atlas",
            enable_tts: true
        }, {
            timeout: 120000 // 2 minutes timeout for testing
        });

        console.log('TTS workflow test completed successfully');
        console.log('Response:', response.data);

    } catch (error) {
        console.error('TTS workflow test failed:', error.message);
    }
}

testTTSWorkflow();