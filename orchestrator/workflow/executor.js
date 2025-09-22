/**
 * WORKFLOW EXECUTOR
 * Виконання workflow етапів згідно конфігурації
 */

import { WORKFLOW_STAGES, WORKFLOW_CONFIG } from './stages.js';
import { WORKFLOW_CONDITIONS } from './conditions.js';
import { AGENTS } from '../config/agents.js';
import { callGooseAgent } from '../agents/goose-client.js';
import { logMessage, sendToTTSAndWait, generateMessageId } from '../utils/helpers.js';

// Імпортуємо нові централізовані модулі
import logger from '../utils/logger.js';
import telemetry from '../utils/telemetry.js';
import errorHandler from '../errors/error-handler.js';

// Семафор для запобігання одночасному запуску агентів
const activeAgentSessions = new Set();

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
    
    const workflowStart = Date.now();
    logger.info(`Starting step-by-step workflow following WORKFLOW_STAGES configuration`);
    
    // 0. Попередній системний вибір режиму (класифікація chat/task) з урахуванням попереднього режиму
    try {
        const modeStageCfg = WORKFLOW_STAGES.find(s => s.stage === 0 && s.agent === 'system');
        if (modeStageCfg) {
            session.currentStage = modeStageCfg.stage;
            const prompts0 = await loadStagePrompts(0, 'system', 'stage0_mode_selection', userMessage, session);
            if (!prompts0) throw new Error('No prompts for system stage 0');
            const modeResponse = await executeAgentStageStepByStep(
                'system',
                'stage0_mode_selection',
                prompts0.systemPrompt,
                prompts0.userPrompt,
                session,
                res,
                { enableTools: false }
            );
            // Очікуємо, що контент містить JSON або ми збережемо результат в meta
            let mode = 'task';
            let confidence = 0.5;
            try {
                const json = JSON.parse((modeResponse?.content || '').replace(/^\[SYSTEM\]\s*/,'').trim());
                if (json && (json.mode === 'chat' || json.mode === 'task')) {
                    mode = json.mode; confidence = json.confidence ?? 0.5;
                }
            } catch (_e) {
                // Якщо відповів не JSON, спробуємо евристику
                const txt = (modeResponse?.content || '').toLowerCase();
                if (txt.includes('"mode":"chat"')) mode = 'chat';
                if (txt.includes('"mode":"task"')) mode = 'task';
            }
            // Якщо попередній режим був chat і впевненість низька — зберігаємо чат для «липкої» бесіди
            if (session.lastMode === 'chat' && confidence < 0.65 && mode === 'task') {
                mode = 'chat';
            }
            session.modeSelection = { mode, confidence };
            session.lastMode = mode;
            // зберігаємо у meta останнього повідомлення
            if (modeResponse) modeResponse.meta = { ...(modeResponse.meta||{}), modeSelection: { mode, confidence } };
            // Позначаємо, що системні повідомлення не мають потрапляти у довготривалу пам'ять чату
            if (modeResponse) modeResponse.memory = { retain: false, type: 'system' };
            session.history.push(modeResponse);

            // Якщо CHAT -> запустимо atlas stage0_chat і завершимо
            if (mode === 'chat') {
                const chatStageCfg = WORKFLOW_STAGES.find(s => s.stage === 0 && s.agent === 'atlas');
                if (chatStageCfg) {
                    const promptsChat = await loadStagePrompts(0, 'atlas', 'stage0_chat', userMessage, session);
                    const chatResp = await executeAgentStageStepByStep(
                        'atlas',
                        'stage0_chat',
                        promptsChat.systemPrompt,
                        promptsChat.userPrompt,
                        session,
                        res,
                        { enableTools: false }
                    );
                    session.history.push(chatResp);
                    // Підтримуємо окремий ниткоподібний контекст чату
                    // Зберігаємо лише користувацькі та атлас-повідомлення, очищаючи службові префікси
                    session.chatThread.messages.push({ role: 'user', content: userMessage, ts: Date.now() });
                    const atlasContent = (chatResp?.content || '').replace(/^\[ATLAS\]\s*/,'');
                    session.chatThread.messages.push({ role: 'atlas', content: atlasContent, ts: Date.now() });
                    // Завершуємо як звичайну відповідь без повного циклу
                    if (!res.writableEnded) {
                        res.write(JSON.stringify({ type: 'workflow_completed', data: { success: true, completed: true, mode: 'chat', session: { id: session.id, totalStages: session.history.length } } })+'\n');
                        res.end();
                    }
                    return;
                }
            }
            // Якщо TASK — продовжуємо звичайний пайплайн (старт зі stage 1)
        }
    } catch (e) {
        logger.error(`Stage0 mode selection failed: ${e.message}`);
        // Проста евристика: якщо привітання/бесіда — чат, інакше — завдання
        const text = (userMessage || '').toLowerCase();
        const chatIndicators = [
            'привіт', 'вітаю', 'хай', 'як справи', 'як ти', 'розкажи', 'що таке', 'поясни',
            'добрий день', 'добрий вечір', 'доброго дня', 'доброго вечора'
        ];
        const isChat = chatIndicators.some(k => text.includes(k)) || session.lastMode === 'chat';
        session.modeSelection = { mode: isChat ? 'chat' : 'task', confidence: isChat ? 0.6 : 0.2 };
        session.lastMode = session.modeSelection.mode;
        if (isChat) {
            // Виконаємо чат-відповідь Атласа й завершимо
            const promptsChat = await loadStagePrompts(0, 'atlas', 'stage0_chat', userMessage, session);
            const chatResp = await executeAgentStageStepByStep(
                'atlas', 'stage0_chat', promptsChat.systemPrompt, promptsChat.userPrompt, session, res, { enableTools: false }
            );
            session.history.push(chatResp);
            session.chatThread.messages.push({ role: 'user', content: userMessage, ts: Date.now() });
            const atlasContent = (chatResp?.content || '').replace(/^\[ATLAS\]\s*/,'');
            session.chatThread.messages.push({ role: 'atlas', content: atlasContent, ts: Date.now() });
            if (!res.writableEnded) {
                res.write(JSON.stringify({ type: 'workflow_completed', data: { success: true, completed: true, mode: 'chat', session: { id: session.id, totalStages: session.history.length } } })+'\n');
                res.end();
            }
            return;
        }
    }

    // Виконуємо етапи згідно конфігурації WORKFLOW_STAGES (починаючи від stage 1)
    for (const stageConfig of WORKFLOW_STAGES) {
        if (stageConfig.stage === 0) continue; // вже виконано вище
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
        
        const stageStart = Date.now();
        
        try {
            logger.info(`Starting execution of stage ${stageConfig.stage} for agent ${stageConfig.agent}`);
            response = await executeStageByConfig(stageConfig, userMessage, session, res);
            
            const stageDuration = Date.now() - stageStart;
            
            if (!response) {
                logger.error(`Stage ${stageConfig.stage} failed - response is null/undefined`);
                
                // Записуємо метрику з помилкою
                telemetry.recordExecution('workflow_stage', stageDuration, false, {
                  stage: stageConfig.stage,
                  agent: stageConfig.agent,
                  error: 'null_response'
                });
                
                return;
            }
            
            logger.info(`Stage ${stageConfig.stage} completed successfully, adding to history`);
            session.history.push(response);
            logger.info(`History now contains ${session.history.length} messages`);
            
            // Записуємо метрику успішного виконання
            telemetry.recordExecution('workflow_stage', stageDuration, true, {
              stage: stageConfig.stage,
              agent: stageConfig.agent
            });
            
        } catch (error) {
            const stageDuration = Date.now() - stageStart;
            logger.error(`Stage ${stageConfig.stage} error: ${error.message}`);
            
            // Використовуємо централізований обробник помилок
            const recovery = await errorHandler.handleError(error, {
              stage: stageConfig.stage,
              agent: stageConfig.agent,
              workflow: 'step-by-step'
            });
            
            // Записуємо метрику з помилкою
            telemetry.recordExecution('workflow_stage', stageDuration, false, {
              stage: stageConfig.stage,
              agent: stageConfig.agent,
              error: error.message
            });
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
    
    // Логування завершення workflow
    const workflowDuration = Date.now() - workflowStart;
    logger.info(`Step-by-step workflow completed`, {
        duration: `${workflowDuration}ms`,
        totalStages: session.history.length,
        cycles: session.retryCycle || 0
    });
    
    // Записуємо метрику виконання всього workflow
    telemetry.recordExecution('workflow', workflowDuration, true, {
        workflow: 'step-by-step',
        totalStages: session.history.length
    });
}

// Виконання етапу згідно конфігурації WORKFLOW_STAGES
export async function executeStageByConfig(stageConfig, userMessage, session, res) {
    const { stage, agent, name } = stageConfig;
    
    // Імпортуємо промпти динамічно
    const prompts = await loadStagePrompts(stage, agent, name, userMessage, session);
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
async function loadStagePrompts(stage, agent, name, userMessage, session) {
    try {
        let systemPrompt, userPrompt;
        
        switch (stage) {
            case 0:
                if (agent === 'system') {
                    const sys0 = await import('../../prompts/system/stage0_mode_selection.js');
                    return {
                        systemPrompt: sys0.SYSTEM_STAGE0_SYSTEM_PROMPT,
                        userPrompt: sys0.SYSTEM_STAGE0_USER_PROMPT(userMessage)
                    };
                }
                if (agent === 'atlas') {
                    const a0 = await import('../../prompts/atlas/stage0_chat.js');
                    // Невеликий контекст останніх 3 повідомлень чату для зв'язності теми
                    const ctx = (session.chatThread?.messages || []).slice(-3).map(m => `${m.role}: ${m.content}`).join('\n');
                    const carry = (session.chatThread?.carryOvers || []).slice(-1).map(c => `ПОПЕРЕДНІЙ ПІДСУМОК (інша тема: ${c.topic || '—'}): ${c.summary}`).join('\n');
                    let enrichedUser = userMessage;
                    if (ctx) enrichedUser += `\n\nКОНТЕКСТ ПОПЕРЕДНЬОЇ БЕСІДИ:\n${ctx}`;
                    if (carry) enrichedUser += `\n\nІСТОРІЯ (короткий підсумок попередньої теми):\n${carry}`;
                    return {
                        systemPrompt: a0.ATLAS_STAGE0_CHAT_SYSTEM_PROMPT,
                        userPrompt: a0.ATLAS_STAGE0_CHAT_USER_PROMPT(enrichedUser)
                    };
                }
                break;
            case 1: // Atlas initial_processing
                const atlasStage1 = await import('../../prompts/atlas/stage1_initial_processing.js');
                systemPrompt = atlasStage1.ATLAS_STAGE1_SYSTEM_PROMPT;
                userPrompt = atlasStage1.ATLAS_STAGE1_USER_PROMPT(userMessage, '');
                break;
                
            case 2: // Tetyana execution
                const tetyanaStage2 = await import('../../prompts/tetyana/stage2_execution.js');
                systemPrompt = tetyanaStage2.TETYANA_STAGE2_SYSTEM_PROMPT;
                // Отримуємо останню відповідь Atlas як завдання
                const lastAtlasResponse = session.history.filter(r => r.agent === 'atlas').pop();
                const atlasTask = lastAtlasResponse ? lastAtlasResponse.content : userMessage;
                userPrompt = tetyanaStage2.TETYANA_STAGE2_USER_PROMPT(atlasTask, userMessage);
                break;
                
            case 3: // Atlas clarification
                const atlasStage3 = await import('../../prompts/atlas/stage3_clarification.js');
                systemPrompt = atlasStage3.ATLAS_STAGE3_SYSTEM_PROMPT;
                // Отримуємо останню відповідь Тетяни та оригінальне завдання
                const lastTetyanaResponse = session.history.filter(r => r.agent === 'tetyana').pop();
                const tetyanaResponse = lastTetyanaResponse ? lastTetyanaResponse.content : '';
                const originalTaskStage3 = session.history.filter(r => r.agent === 'atlas')[0]?.content || '';
                userPrompt = atlasStage3.ATLAS_STAGE3_USER_PROMPT(tetyanaResponse, originalTaskStage3, userMessage);
                break;
                
            case 4: // Tetyana retry_execution
                const tetyanaStage4 = await import('../../prompts/tetyana/stage4_retry.js');
                systemPrompt = tetyanaStage4.TETYANA_STAGE4_SYSTEM_PROMPT;
                // Отримуємо останнє уточнення Atlas та попередню спробу
                const lastAtlasGuidance = session.history.filter(r => r.agent === 'atlas').pop()?.content || '';
                const originalTaskStage4 = session.history.filter(r => r.agent === 'atlas')[0]?.content || userMessage;
                const previousAttempt = session.history.filter(r => r.agent === 'tetyana').pop()?.content || '';
                userPrompt = tetyanaStage4.TETYANA_STAGE4_USER_PROMPT(lastAtlasGuidance, originalTaskStage4, previousAttempt);
                break;
                
            case 5: // Grisha diagnosis
                const grishaStage5 = await import('../../prompts/grisha/stage5_diagnosis.js');
                systemPrompt = grishaStage5.GRISHA_STAGE5_SYSTEM_PROMPT;
                // Збираємо всі спроби Atlas та Тетяни
                const atlasAttempts = session.history.filter(r => r.agent === 'atlas').map(r => r.content).join('\n\n');
                const tetyanaAttempts = session.history.filter(r => r.agent === 'tetyana').map(r => r.content).join('\n\n');
                userPrompt = grishaStage5.GRISHA_STAGE5_USER_PROMPT(userMessage, atlasAttempts, tetyanaAttempts);
                break;
                
            case 6: // Atlas task_adjustment
                const atlasStage6 = await import('../../prompts/atlas/stage6_task_adjustment.js');
                systemPrompt = atlasStage6.ATLAS_STAGE6_SYSTEM_PROMPT;
                // Отримуємо діагноз Гріші та всі попередні спроби
                const grishaDiagnosis = session.history.filter(r => r.agent === 'grisha').pop()?.content || '';
                const allPreviousAttemptsStage6 = session.history.filter(r => r.agent === 'tetyana').map(r => r.content).join('\n\n');
                userPrompt = atlasStage6.ATLAS_STAGE6_USER_PROMPT(userMessage, grishaDiagnosis, allPreviousAttemptsStage6);
                break;
                
            case 7: // Grisha verification
                const grishaStage7 = await import('../../prompts/grisha/stage7_verification.js');
                systemPrompt = grishaStage7.GRISHA_STAGE7_SYSTEM_PROMPT;
                // Отримуємо результати виконання та очікуваний результат
                const executionResults = session.history.filter(r => r.agent === 'tetyana').pop()?.content || '';
                const expectedOutcome = session.history.filter(r => r.agent === 'atlas')[0]?.content || userMessage;
                userPrompt = grishaStage7.GRISHA_STAGE7_USER_PROMPT(userMessage, executionResults, expectedOutcome);
                break;
                
            case 8: // System completion
                return { 
                    systemPrompt: 'System completion stage',
                    userPrompt: 'Workflow completed'
                };
                
            case 9: // Atlas retry_cycle
                const atlasStage9 = await import('../../prompts/atlas/stage7_retry_cycle.js');
                systemPrompt = atlasStage9.ATLAS_STAGE7_SYSTEM_PROMPT;
                // Отримуємо звіт верифікації Гріші та всі попередні спроби
                const grishaVerificationReport = session.history.filter(r => r.agent === 'grisha').pop()?.content || '';
                const allPreviousAttemptsStage9 = session.history.filter(r => r.agent === 'tetyana').map(r => r.content).join('\n\n');
                userPrompt = atlasStage9.ATLAS_STAGE9_USER_PROMPT(userMessage, grishaVerificationReport, allPreviousAttemptsStage9);
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
    const sessionKey = `${session.id}_${agentName}_${stageName}`;
    
    // Перевіряємо чи не запущений вже цей агент для цієї сесії
    if (activeAgentSessions.has(sessionKey)) {
        logMessage('warn', `Step-by-step: ${agentName} already running for ${stageName}, skipping duplicate`);
        return null;
    }
    
    // Додаємо в активні сесії
    activeAgentSessions.add(sessionKey);
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
        // Очищаємо семафор при помилці
        activeAgentSessions.delete(sessionKey);
        throw error;
    }
    
    // Додаємо підпис агента (якщо агент існує і має підпис)
    if (agent && agent.signature && !content.includes(agent.signature)) {
        content = `${agent.signature} ${content}`;
    }
    
    const response = {
        role: 'assistant',
        content,
        agent: agentName,
        stage: stageName,
        messageId,
        timestamp: Date.now(),
        voice: agent.voice || 'default', // Добавлено поле voice
        color: agent.color,
        provider,
        stepByStep: true,
        messageType: agentName === 'tetyana' ? 'execution' : 'final' // Фильтр для TTS
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
    
    // ОЧІКУВАННЯ ЗАВЕРШЕННЯ TTS ПЕРЕД ПРОДОВЖЕННЯМ
    // Відправляємо текст на озвучення і чекаємо завершення
    if (agent && agent.voice && content) {
        logMessage('info', `Step-by-step: Waiting for TTS completion: ${agentName} (${agent.voice})`);
        await sendToTTSAndWait(content, agent.voice);
        logMessage('info', `Step-by-step: TTS completed for ${agentName}, continuing workflow`);
    } else {
        // Fallback - звичайна пауза якщо немає TTS
        const displayPause = agentName === 'grisha' ? 3000 : 1500;
        await new Promise(resolve => setTimeout(resolve, displayPause));
        logMessage('info', `Step-by-step: Pause completed for ${agentName}, continuing workflow`);
    }
    
    logMessage('info', `Step-by-step: Auto-continuing: ${agentName} - ${stageName}`);
    
    // Очищаємо семафор після завершення
    activeAgentSessions.delete(sessionKey);
    
    return response;
}

// Допоміжні: виявлення теми розмови
async function detectChatTopic(userMessage, session) {
    try {
        const { SYSTEM_CHAT_TOPIC_SYSTEM_PROMPT, SYSTEM_CHAT_TOPIC_USER_PROMPT } = await import('../../prompts/system/chat_topic.js');
        const prompt = `${SYSTEM_CHAT_TOPIC_SYSTEM_PROMPT}\n\n${SYSTEM_CHAT_TOPIC_USER_PROMPT(userMessage, (session.chatThread?.messages||[]).slice(-2).map(m=>`${m.role}: ${m.content}`).join('\n'))}`;
        const text = await callGooseAgent(prompt, session.id, { agent: 'system' });
        let obj = { topic: 'загальна розмова', keywords: [], confidence: 0.5 };
        try { obj = JSON.parse(String(text || '{}').replace(/^\[SYSTEM\]\s*/,'').trim()); } catch {}
        return obj;
    } catch {
        return { topic: 'загальна розмова', keywords: [], confidence: 0.3 };
    }
}

function isTopicChanged(prevTopic, nextTopicObj) {
    const nextTopic = (nextTopicObj?.topic || '').toLowerCase().trim();
    const prev = (prevTopic || '').toLowerCase().trim();
    if (!prev) return false;
    if (!nextTopic) return false;
    if (prev === nextTopic) return false;
    // Проста евристика: якщо немає перетину ключових слів і назви різні — вважаємо зміну
    const nextKw = new Set((nextTopicObj?.keywords || []).map(k=>k.toLowerCase()));
    const overlap = (kw) => Array.from(nextKw).some(x => kw.includes(x));
    if (nextKw.size === 0) return true;
    return !overlap(prev.split(/\s+/));
}

async function summarizeChatThread(messages) {
    try {
        const { SYSTEM_CHAT_SUMMARY_SYSTEM_PROMPT, SYSTEM_CHAT_SUMMARY_USER_PROMPT } = await import('../../prompts/system/chat_summary.js');
        const prompt = `${SYSTEM_CHAT_SUMMARY_SYSTEM_PROMPT}\n\n${SYSTEM_CHAT_SUMMARY_USER_PROMPT(messages)}`;
        const text = await callGooseAgent(prompt, 'summary', { agent: 'system' });
        return (text || '').replace(/^\[SYSTEM\]\s*/,'').trim();
    } catch {
        return 'Короткий підсумок попередньої розмови недоступний.';
    }
}
