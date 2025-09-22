/**
 * Модуль для збереження та відновлення стану
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import stateManager from './state-manager.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_PATH = path.join(__dirname, '../../logs/state');

// Створюємо директорію, якщо не існує
async function ensureStorageDirectory() {
  try {
    await fs.mkdir(STORAGE_PATH, { recursive: true });
  } catch (err) {
    logger.error('Помилка створення директорії для станів', err);
  }
}

async function saveState(sessionId) {
  try {
    await ensureStorageDirectory();
    const state = stateManager.getCurrentState();
    const filePath = path.join(STORAGE_PATH, `${sessionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
    logger.info(`Стан збережено: ${filePath}`);
    return true;
  } catch (err) {
    logger.error('Помилка збереження стану', err);
    return false;
  }
}

async function loadState(sessionId) {
  try {
    const filePath = path.join(STORAGE_PATH, `${sessionId}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    const state = JSON.parse(data);
    stateManager.updateState(state);
    logger.info(`Стан завантажено: ${filePath}`);
    return state;
  } catch (err) {
    logger.error(`Стан не знайдено для ${sessionId}`, err);
    return null;
  }
}

export { saveState, loadState };