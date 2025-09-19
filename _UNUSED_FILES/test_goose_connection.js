#!/usr/bin/env node

/**
 * Тестовий скрипт для перевірки підключення до Goose Desktop
 */

import http from 'http';
import WebSocket from 'ws';

// Функція перевірки HTTP порту
function checkHttpPort(port) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: port,
            method: 'GET',
            timeout: 2000
        }, (res) => {
            resolve(res.statusCode);
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
        
        req.end();
    });
}

// Функція виявлення порту Goose
async function detectGoosePort() {
    const commonPorts = [3000, 49299, 51958, 65459, 8080, 8000];
    
    console.log('🔍 Пошук Goose Desktop...');
    
    for (const port of commonPorts) {
        try {
            const statusCode = await checkHttpPort(port);
            
            if (statusCode === 401 || statusCode === 200 || statusCode === 404) {
                console.log(`✅ Goose знайдено на порту ${port} (HTTP ${statusCode})`);
                return port;
            }
        } catch (error) {
            continue;
        }
    }
    
    console.log('❌ Goose не знайдено на жодному порту');
    return null;
}

// Тестування WebSocket підключення
async function testWebSocketConnection(port) {
    return new Promise((resolve) => {
        const wsUrl = `ws://localhost:${port}/ws`;
        console.log(`🔌 Тестування WebSocket: ${wsUrl}`);
        
        const ws = new WebSocket(wsUrl);
        let timeout;
        
        timeout = setTimeout(() => {
            console.log('⏰ WebSocket timeout (5 секунд)');
            ws.close();
            resolve(false);
        }, 5000);
        
        ws.on('open', () => {
            console.log('✅ WebSocket підключення успішне');
            clearTimeout(timeout);
            
            // Відправимо тестове повідомлення
            const testMessage = {
                type: 'message',
                content: 'Привіт, це тест підключення',
                session_id: 'test_session_' + Date.now(),
                timestamp: new Date().toISOString()
            };
            
            console.log('📤 Відправляємо тестове повідомлення...');
            ws.send(JSON.stringify(testMessage));
        });
        
        ws.on('message', (data) => {
            console.log('📥 Отримано відповідь від Goose:');
            console.log(data.toString());
            clearTimeout(timeout);
            ws.close();
            resolve(true);
        });
        
        ws.on('error', (error) => {
            console.log(`❌ WebSocket помилка: ${error.message}`);
            clearTimeout(timeout);
            resolve(false);
        });
        
        ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket закрито: код ${code}, причина: ${reason || 'не вказано'}`);
            clearTimeout(timeout);
            resolve(code === 1000); // 1000 = normal closure
        });
    });
}

// Основна функція тестування
async function main() {
    console.log('🚀 Тестування підключення до Goose Desktop\n');
    
    // 1. Виявлення порту
    const port = await detectGoosePort();
    if (!port) {
        console.log('\n❌ Не вдалося знайти Goose Desktop');
        console.log('💡 Переконайтеся що Goose Desktop запущений');
        process.exit(1);
    }
    
    // 2. Тестування HTTP підключення
    console.log(`\n🌐 Тестування HTTP підключення до порту ${port}...`);
    try {
        const statusCode = await checkHttpPort(port);
        console.log(`✅ HTTP відповідь: ${statusCode}`);
    } catch (error) {
        console.log(`❌ HTTP помилка: ${error.message}`);
    }
    
    // 3. Тестування WebSocket підключення
    console.log(`\n🔌 Тестування WebSocket підключення...`);
    const wsSuccess = await testWebSocketConnection(port);
    
    // Підсумок
    console.log('\n📊 РЕЗУЛЬТАТИ ТЕСТУВАННЯ:');
    console.log(`   Goose порт: ${port}`);
    console.log(`   HTTP: ✅ Працює`);
    console.log(`   WebSocket: ${wsSuccess ? '✅ Працює' : '❌ Не працює'}`);
    
    if (wsSuccess) {
        console.log('\n🎉 Goose Desktop готовий до роботи з ATLAS!');
    } else {
        console.log('\n⚠️  Проблеми з WebSocket підключенням');
        console.log('💡 Перевірте налаштування Goose Desktop');
    }
}

main().catch(console.error);
