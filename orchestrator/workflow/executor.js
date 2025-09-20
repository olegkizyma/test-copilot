/**
 * WORKFLOW EXECUTOR
 * Виконання workflow етапів згідно конфігурації
 */

import { WORKFLOW_STAGES, WORKFLOW_CONFIG } from './stages.js';
import { WORKFLOW_CONDITIONS } from './conditions.js';
import { AGENTS, generateShortStatus } from '../config/agents.js';
import { callGooseAgent } from '../agents/goose-client.js';
import { generateMessageId, logMessage, waitForTTSCompletion } from '../utils/helpers.js';

// Перевірка умов workflow (async)
export async function checkWorkflowCondition(conditionName, data) {
    const condition = WORKFLOW_CONDITIONS[conditionName];
    if (!condition) return false;
    try {
        return await condition(data);
    } catch (error) {
        logMessage('error', `Workflow condition error for ${conditionName}: ${error.message}`);
        return false;
    }
}

// STEP-BY-STEP WORKFLOW - використовує конфігурацію з stages.js
export async function executeStepByStepWorkflow(userMessage, session, res) {
    // Додаємо повідомлення користувача
    session.history.push({
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
    });
    
    logMessage('info', `Starting step-by-step workflow following WORKFLOW_STAGES configuration`);
    
    // Виконуємо етапи згідно конфігурації WORKFLOW_STAGES
    for (const stageConfig of WORKFLOW_STAGES) {
        logMessage('info', `Processing stage ${stageConfig.stage}: ${stageConfig.agent} - ${stageConfig.name}`);
        
        // Перевіряємо чи потрібен цей етап
        if (!stageConfig.required && stageConfig.condition) {
            let conditionMet = false;
            
            // Різні умови потребують різних даних
            if (stageConfig.condition === 'tetyana_needs_clarification') {
                const lastResponse = session.history[session.history.length - 1];
                conditionMet = await checkWorkflowCondition(stageConfig.condition, { response: lastResponse, session: session });
            } else if (stageConfig.condition === 'atlas_provided_clarification') {
                // Перевіряємо чи Atlas щойно надав уточнення
                const lastAtlasResponse = session.history.filter(r => r.agent === 'atlas').pop();
                conditionMet = await checkWorkflowCondition(stageConfig.condition, { response: lastAtlasResponse, session: session });
            } else if (stageConfig.condition === 'verification_failed') {
                const lastGrishaResponse = session.history.filter(r => r.agent === 'grisha').pop();
                conditionMet = await checkWorkflowCondition(stageConfig.condition, { response: lastGrishaResponse, session: session });
            } else if (stageConfig.condition === 'tetyana_completed_task') {
                const lastTetyanaResponse = session.history.filter(r => r.agent === 'tetyana').pop();
                conditionMet = await checkWorkflowCondition(stageConfig.condition, { response: lastTetyanaResponse, session: session });
                logMessage('info', `Tetyana completion check result: ${conditionMet}`);
            } else {
                // Загальна перевірка
                const lastResponse = session.history[session.history.length - 1];
                conditionMet = await checkWorkflowCondition(stageConfig.condition, { response: lastResponse, session: session });
            }
            
            if (!conditionMet) {
                logMessage('info', `Skipping stage ${stageConfig.stage} - condition '${stageConfig.condition}' not met`);
                continue;
            }
        }
        
        // Виконуємо етап
        session.currentStage = stageConfig.stage;
        let response;
        
        try {
            response = await executeStageByConfig(stageConfig, userMessage, session, res);
            if (!response) {
                logMessage('error', `Stage ${stageConfig.stage} failed - stopping workflow`);
                return;
            }
            session.history.push(response);
        } catch (error) {
            logMessage('error', `Stage ${stageConfig.stage} error: ${error.message}`);
            if (!res.writableEnded) {
                res.write(JSON.stringify({
                    type: 'workflow_error',
                    data: {
                        error: `${stageConfig.agent} не може відповісти`,
                        details: error.message,
                        agent: stageConfig.agent,
                        stage: stageConfig.stage
                    }
                }) + '\n');
            }
            return;
        }
    }
    
    // Завершуємо workflow ТІЛЬКИ після успішної верифікації
    // Інакше - перевіряємо чи потрібно новий цикл
    const lastGrishaResponse = session.history.filter(r => r.agent === 'grisha').pop();
    const verificationFailed = await checkWorkflowCondition('verification_failed', { response: lastGrishaResponse, session: session });

    if (!verificationFailed) {
        // Верифікація пройшла успішно!
        session.verified = true;
        logMessage('info', 'Verification PASSED - workflow should complete');
        
        // Додаткова пауза після відповіді Гріші, щоб користувач встиг прочитати
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунди
        
        logMessage('info', 'About to send workflow_completed event');

        // ВАЖЛИВО: Відправляємо фінальний статус ПЕРШИМ
        if (!res.writableEnded) {
            res.write(JSON.stringify({
                type: 'workflow_completed',
                data: {
                    success: true,
                    completed: true,
                    session: {
                        id: session.id,
                        verified: true,
                        totalStages: session.history.length,
                        cycles: 1
                    }
                }
            }) + '\n');

            // Завершуємо відповідь
            res.end();
        }
    } else {
        // Верифікація не пройшла - перевіряємо чи потрібно новий цикл
        logMessage('warn', 'Verification FAILED - checking if retry cycle needed');
        session.verified = false;

        // Перевіряємо чи потрібно новий цикл
        const shouldRetry = await checkWorkflowCondition('should_retry_cycle', { response: lastGrishaResponse, session: session });
        console.log(`[DEBUG] should_retry_cycle result: ${shouldRetry}`);
        if (shouldRetry) {
            logMessage('info', 'Starting new retry cycle due to verification failure');
            // Новий цикл почнеться з Atlas (stage9_retry_cycle)
            // Позначаємо що потрібно почати новий цикл
            session.retryCycle = (session.retryCycle || 0) + 1;
            session.currentStage = 9; // Atlas retry_cycle

            // Відправляємо повідомлення про початок нового циклу
            if (!res.writableEnded) {
                res.write(JSON.stringify({
                    type: 'retry_cycle_started',
                    data: {
                        cycle: session.retryCycle,
                        reason: 'verification_failed',
                        message: 'Починаємо новий цикл через невдачу верифікації'
                    }
                }) + '\n');
            }
        } else {
            logMessage('info', 'No more retries available - completing workflow with failure');
            // Відправляємо фінальний статус з невдачею
            if (!res.writableEnded) {
                res.write(JSON.stringify({
                    type: 'workflow_completed',
                    data: {
                        success: false,
                        completed: true,
                        failed: true,
                        reason: 'verification_failed_no_retries',
                        session: {
                            id: session.id,
                            verified: false,
                            totalStages: session.history.length,
                            cycles: session.retryCycle || 0
                        }
                    }
                }) + '\n');

                // Завершуємо відповідь
                res.end();
            }
        }
    }
}

// Виконання етапу згідно конфігурації WORKFLOW_STAGES
export async function executeStageByConfig(stageConfig, userMessage, session, res) {
    const { stage, agent, name } = stageConfig;
    
    // Імпортуємо промпти динамічно
    const prompts = await loadStagePrompts(stage, agent, name);
    if (!prompts) {
        throw new Error(`Could not load prompts for stage ${stage}`);
    }
    
    const { systemPrompt, userPrompt } = prompts;
    
    // Виконуємо етап
    return await executeAgentStageStepByStep(
        agent,
        `stage${stage}_${name}`,
        systemPrompt,
        userPrompt,
        session,
        res,
        { enableTools: AGENTS[agent]?.enableTools || false }
    );
}

// Динамічне завантаження промптів для етапу
async function loadStagePrompts(stage, agent, name) {
    try {
        let systemPrompt, userPrompt;
        
        switch (stage) {
            case 1: // Atlas initial_processing
                const atlasStage1 = await import('../../prompts/atlas/stage1_initial_processing.js');
                systemPrompt = atlasStage1.ATLAS_STAGE1_SYSTEM_PROMPT;
                userPrompt = atlasStage1.ATLAS_STAGE1_USER_PROMPT;
                break;
                
            case 2: // Tetyana execution
                const tetyanaStage2 = await import('../../prompts/tetyana/stage2_execution.js');
                systemPrompt = tetyanaStage2.TETYANA_STAGE2_SYSTEM_PROMPT;
                userPrompt = tetyanaStage2.TETYANA_STAGE2_USER_PROMPT;
                break;
                
            case 3: // Atlas clarification
                const atlasStage3 = await import('../../prompts/atlas/stage3_clarification.js');
                systemPrompt = atlasStage3.ATLAS_STAGE3_SYSTEM_PROMPT;
                userPrompt = atlasStage3.ATLAS_STAGE3_USER_PROMPT;
                break;
                
            case 4: // Tetyana retry_execution
                const tetyanaStage4 = await import('../../prompts/tetyana/stage4_retry.js');
                systemPrompt = tetyanaStage4.TETYANA_STAGE4_SYSTEM_PROMPT;
                userPrompt = tetyanaStage4.TETYANA_STAGE4_USER_PROMPT;
                break;
                
            case 5: // Grisha diagnosis
                const grishaStage5 = await import('../../prompts/grisha/stage5_diagnosis.js');
                systemPrompt = grishaStage5.GRISHA_STAGE5_SYSTEM_PROMPT;
                userPrompt = grishaStage5.GRISHA_STAGE5_USER_PROMPT;
                break;
                
            case 6: // Atlas task_adjustment
                const atlasStage6 = await import('../../prompts/atlas/stage6_task_adjustment.js');
                systemPrompt = atlasStage6.ATLAS_STAGE6_SYSTEM_PROMPT;
                userPrompt = atlasStage6.ATLAS_STAGE6_USER_PROMPT;
                break;
                
            case 7: // Grisha verification
                const grishaStage7 = await import('../../prompts/grisha/stage7_verification.js');
                systemPrompt = grishaStage7.GRISHA_STAGE7_SYSTEM_PROMPT;
                userPrompt = grishaStage7.GRISHA_STAGE7_USER_PROMPT;
                break;
                
            case 8: // System completion
                return { 
                    systemPrompt: 'System completion stage',
                    userPrompt: 'Workflow completed'
                };
                
            case 9: // Atlas retry_cycle
                const atlasStage9 = await import('../../prompts/atlas/stage7_retry_cycle.js');
                systemPrompt = atlasStage9.ATLAS_STAGE7_SYSTEM_PROMPT;
                userPrompt = atlasStage9.ATLAS_STAGE7_USER_PROMPT;
                break;
                
            default:
                return null;
        }
        
        return { systemPrompt, userPrompt };
    } catch (error) {
        logMessage('error', `Failed to load prompts for stage ${stage}: ${error.message}`);
        return null;
    }
}

// STEP-BY-STEP виконання етапу агента - чекає підтвердження від фронтенду
export async function executeAgentStageStepByStep(agentName, stageName, systemPrompt, userPrompt, session, res, options = {}) {
    const agent = AGENTS[agentName];
    const messageId = generateMessageId();
    
    logMessage('info', `Step-by-step: ${agentName} starting ${stageName}`);
    
    let content;
    let provider = 'simulation';
    
    try {
        // Спроба через Goose з правильним промптом
        const fullPrompt = `${systemPrompt}\n\nUser Request: ${userPrompt}`;
        const gooseText = await callGooseAgent(fullPrompt, session.id, {
            enableTools: options.enableTools === true,
            agent: agentName
        });
        
        if (gooseText && gooseText.trim().length > 0) {
            content = gooseText;
            provider = 'goose';
            logMessage('info', `Step-by-step: Real execution via Goose: ${agentName}`);
        } else {
            // СИМУЛЯЦІЯ ВІДКЛЮЧЕНА - тільки реальні відповіді від Goose
            throw new Error(`Goose did not respond for agent ${agentName}. Simulation disabled.`);
        }
    } catch (error) {
        logMessage('error', `Step-by-step: Agent ${agentName} FAILED - no simulation: ${error.message}`);
        throw error;
    }
    
    // Додаємо підпис агента
    if (!content.includes(agent.signature)) {
        content = `${agent.signature} ${content}`;
    }
    
    const response = {
        role: 'assistant',
        content,
        agent: agentName,
        stage: stageName,
        messageId,
        timestamp: Date.now(),
        voice: agent.voice,
        color: agent.color,
        provider,
        stepByStep: true
    };
    
    // ВІДПРАВЛЯЄМО ПОВІДОМЛЕННЯ ФРОНТЕНДУ
    try {
        if (!res.writableEnded) {
            res.write(JSON.stringify({
                type: 'agent_message',
                data: response
            }) + '\n');
        }
    } catch (writeError) {
        logMessage('error', `Step-by-step: Failed to write response: ${writeError.message}`);
        return response;
    }
    
    // АВТОМАТИЧНЕ ПРОДОВЖЕННЯ З ПАУЗОЮ
    // Для Гріші - довша пауза, щоб користувач встиг прочитати верифікацію
    const displayPause = agentName === 'grisha' ? 3000 : 1500; // 3 сек для Гріші, 1.5 для інших
    await new Promise(resolve => setTimeout(resolve, displayPause));
    
    logMessage('info', `Step-by-step: Auto-continuing: ${agentName} - ${stageName}`);
    return response;
}
