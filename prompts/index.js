/**
 * Центральний реєстр всіх промптів системи
 */
const fs = require('fs');
const path = require('path');
const logger = require('../orchestrator/utils/logger');

// Функція завантаження промптів з директорії
function loadPromptsFromDirectory(directory) {
  const promptsPath = path.join(__dirname, directory);
  
  // Перевіряємо, чи існує директорія
  if (!fs.existsSync(promptsPath)) {
    logger.warn(`Директорія промптів не знайдена: ${promptsPath}`);
    return {};
  }
  
  const promptFiles = fs.readdirSync(promptsPath)
    .filter(file => file.endsWith('.js'));
  
  const prompts = {};
  
  promptFiles.forEach(file => {
    try {
      const promptModule = require(path.join(promptsPath, file));
      const promptName = file.replace('.js', '');
      prompts[promptName] = promptModule;
    } catch (error) {
      logger.error(`Помилка завантаження промпту ${file}:`, error);
    }
  });
  
  return prompts;
}

// Завантажуємо промпти з усіх директорій
const atlasPrompts = loadPromptsFromDirectory('atlas');
const grishaPrompts = loadPromptsFromDirectory('grisha');
const tetyanaPrompts = loadPromptsFromDirectory('tetyana');
const systemPrompts = loadPromptsFromDirectory('system');

// Об'єднуємо всі промпти в єдиний реєстр
const allPrompts = {
  atlas: atlasPrompts,
  grisha: grishaPrompts,
  tetyana: tetyanaPrompts,
  system: systemPrompts
};

module.exports = allPrompts;