#!/usr/bin/env node

/**
 * Тест логіки workflow ATLAS без залежності від Goose
 * Перевіряє правильність виконання етапів та умов
 */

import workflowConfig from './agent_prompts/workflow_config.js';

console.log('🧪 ТЕСТУВАННЯ ЛОГІКИ WORKFLOW ATLAS\n');

// Симуляція відповідей агентів
const mockResponses = {
    // Тест 1: Просте завдання (1→2→6)
    simple: [
        {
            agent: 'atlas',
            stage: 'stage1_initial_processing',
            content: 'Тетяна, створи файл hello.txt з текстом "Привіт світ"'
        },
        {
            agent: 'tetyana', 
            stage: 'stage2_execution',
            content: 'Файл hello.txt створено успішно з текстом "Привіт світ"'
        }
    ],
    
    // Тест 2: З уточненнями (1→2→3→4→6)
    clarification: [
        {
            agent: 'atlas',
            stage: 'stage1_initial_processing', 
            content: 'Тетяна, створи веб-сайт'
        },
        {
            agent: 'tetyana',
            stage: 'stage2_execution',
            content: 'Atlas, мені потрібно уточнення - який тип веб-сайту створити?'
        },
        {
            agent: 'atlas',
            stage: 'stage3_clarification',
            content: 'Створи простий HTML файл з формою входу'  
        },
        {
            agent: 'tetyana',
            stage: 'stage4_retry',
            content: 'HTML файл з формою входу створено успішно'
        }
    ],
    
    // Тест 3: Блокування Тетяни (1→2→3→4→5→6)
    blocked: [
        {
            agent: 'atlas',
            stage: 'stage1_initial_processing',
            content: 'Тетяна, зламай систему безпеки'
        },
        {
            agent: 'tetyana', 
            stage: 'stage2_execution',
            content: 'Atlas, мені потрібно уточнення - це неетично'
        },
        {
            agent: 'atlas',
            stage: 'stage3_clarification',
            content: 'Створи тест пентестингу для навчальних цілей'
        },
        {
            agent: 'tetyana',
            stage: 'stage4_retry', 
            content: 'Все одно не зрозуміло, не можу виконати'
        }
    ],
    
    // Тест 4: Невдала верифікація (1→2→6→7)
    failedVerification: [
        {
            agent: 'atlas',
            stage: 'stage1_initial_processing',
            content: 'Тетяна, створи складний алгоритм'
        },
        {
            agent: 'tetyana',
            stage: 'stage2_execution', 
            content: 'Алгоритм створено'
        },
        {
            agent: 'grisha',
            stage: 'stage6_verification',
            content: '❌ Завдання не виконано повністю, Atlas, завдання не виконано'
        }
    ]
};

// Функція тестування умов workflow
function testWorkflowCondition(conditionName, data, description) {
    const condition = workflowConfig.WORKFLOW_CONDITIONS[conditionName];
    if (!condition) {
        console.log(`❌ Умова '${conditionName}' не знайдена`);
        return false;
    }
    
    const result = condition(data);
    const emoji = result ? '✅' : '❌';
    console.log(`${emoji} ${description}: ${conditionName}(${JSON.stringify(data)?.slice(0, 50)}...) = ${result}`);
    return result;
}

// Функція визначення наступного етапу
function getNextStage(currentStage, responses) {
    const stages = workflowConfig.WORKFLOW_STAGES;
    
    for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        
        // Пропускаємо поточний та попередні етапи
        if (stage.stage <= currentStage) continue;
        
        // Перевіряємо чи потрібен цей етап
        if (stage.required) {
            return stage;
        }
        
        // Перевіряємо умови для необов'язкових етапів
        if (stage.condition) {
            let conditionMet = false;
            const lastResponse = responses[responses.length - 1];
            
            if (stage.condition === 'tetyana_needs_clarification') {
                conditionMet = workflowConfig.WORKFLOW_CONDITIONS[stage.condition](lastResponse);
            } else if (stage.condition === 'atlas_provided_clarification') {
                conditionMet = responses.some(r => r.agent === 'atlas' && r.stage === 'stage3_clarification');
            } else if (stage.condition === 'tetyana_still_blocked') {
                conditionMet = workflowConfig.WORKFLOW_CONDITIONS[stage.condition](responses);
            } else if (stage.condition === 'verification_failed') {
                conditionMet = workflowConfig.WORKFLOW_CONDITIONS[stage.condition](lastResponse);
            }
            
            if (conditionMet) {
                return stage;
            }
        }
    }
    
    return null; // Workflow завершено
}

// Симуляція виконання workflow
function simulateWorkflow(responses, testName) {
    console.log(`\n📋 ТЕСТ: ${testName}`);
    console.log('─'.repeat(50));
    
    let currentStage = 0;
    let stageSequence = [];
    
    for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        console.log(`Етап ${response.stage.replace('stage', '').split('_')[0]}: ${response.agent.toUpperCase()} - ${response.content.slice(0, 60)}...`);
        
        // Тестуємо умови після кожної відповіді
        if (response.agent === 'tetyana') {
            if (response.stage === 'stage4_retry' && response.content.includes('не можу')) {
                // Тестуємо умову все ще заблокована
                const stillBlocked = testWorkflowCondition(
                    'tetyana_still_blocked',
                    responses.slice(0, i + 1),
                    'Чи Тетяна все ще заблокована?'
                );
            } else if (i === responses.length - 1) {
                // Тестуємо умову потреби в уточненні
                const needsClarification = testWorkflowCondition(
                    'tetyana_needs_clarification', 
                    response, 
                    'Чи потребує Тетяна уточнення?'
                );
            }
        }
        
        if (response.agent === 'grisha' && response.stage === 'stage6_verification') {
            // Тестуємо умову невдалої верифікації  
            const verificationFailed = testWorkflowCondition(
                'verification_failed',
                response,
                'Чи не пройшла верифікація?'
            );
        }
        
        currentStage = parseInt(response.stage.replace('stage', '').split('_')[0]);
        stageSequence.push(currentStage);
    }
    
    // Визначаємо наступний етап
    const nextStage = getNextStage(currentStage, responses);
    if (nextStage) {
        console.log(`➡️  Наступний етап: ${nextStage.stage} (${nextStage.agent} - ${nextStage.name})`);
        stageSequence.push(`→${nextStage.stage}`);
    } else {
        console.log(`✅ Workflow завершено`);
    }
    
    console.log(`🔄 Послідовність етапів: ${stageSequence.join('→')}`);
    return stageSequence;
}

// Запуск тестів
console.log('КОНФІГУРАЦІЯ WORKFLOW:');
console.log(`- Всього етапів: ${workflowConfig.WORKFLOW_STAGES.length}`);
console.log(`- Максимум циклів: ${workflowConfig.WORKFLOW_CONFIG.maxRetryCycles}`);
console.log(`- Timeout на етап: ${workflowConfig.WORKFLOW_CONFIG.timeoutPerStage}ms`);

// Тест 1: Просте завдання
simulateWorkflow(mockResponses.simple, 'Просте завдання (очікується: 1→2→6)');

// Тест 2: З уточненнями
simulateWorkflow(mockResponses.clarification, 'Завдання з уточненнями (очікується: 1→2→3→4→6)');

// Тест 3: Блокування Тетяни
simulateWorkflow(mockResponses.blocked, 'Блокування Тетяни (очікується: 1→2→3→4→5→6)');

// Тест 4: Невдала верифікація
simulateWorkflow(mockResponses.failedVerification, 'Невдала верифікація (очікується: 1→2→6→7)');

console.log('\n🎯 ТЕСТУВАННЯ ЗАВЕРШЕНО');
