'use strict';
/**
 * keystore.js — хранение API-ключей в main-процессе.
 *
 * • На Windows/macOS ключи шифруются системным хранилищем (DPAPI / Keychain)
 *   через safeStorage; в файл попадает только base64 шифртекста.
 * • Если шифрование недоступно (Linux без keyring), ключ хранится в открытом
 *   виде, а UI показывает предупреждение.
 * • Рендерер никогда не получает значение ключа — только «есть / нет».
 */

const fs = require('fs');
const path = require('path');

function createKeyStore({ dir, safeStorage }) {
    const file = path.join(dir, 'ai-keys.json');
    let state = null;

    function encryptionAvailable() {
        try {
            return !!(safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable());
        } catch (_) {
            return false;
        }
    }

    function load() {
        if (state) return state;
        let raw = null;
        try {
            raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (_) {
            raw = null;
        }
        if (!raw || typeof raw !== 'object' || !raw.keys || typeof raw.keys !== 'object') {
            raw = { v: 1, keys: {} };
        }
        state = raw;
        return state;
    }

    function persist() {
        try {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
        } catch (err) {
            console.warn('[AI] Не удалось сохранить ключи:', err.message);
        }
    }

    function encode(value) {
        if (encryptionAvailable()) {
            try {
                return { enc: true, value: safeStorage.encryptString(value).toString('base64') };
            } catch (err) {
                console.warn('[AI] safeStorage.encryptString упал:', err.message);
            }
        }
        return { enc: false, value };
    }

    function decode(record) {
        if (!record) return '';
        if (record.enc) {
            try {
                return safeStorage.decryptString(Buffer.from(record.value, 'base64'));
            } catch (err) {
                console.warn('[AI] Не удалось расшифровать ключ:', err.message);
                return '';
            }
        }
        return typeof record.value === 'string' ? record.value : '';
    }

    return {
        has(id) {
            const data = load();
            return !!(data.keys[id] && data.keys[id].value);
        },
        get(id) {
            const data = load();
            return decode(data.keys[id]);
        },
        set(id, value) {
            const data = load();
            if (!value) {
                delete data.keys[id];
            } else {
                data.keys[id] = encode(String(value));
            }
            persist();
        },
        remove(id) {
            const data = load();
            delete data.keys[id];
            persist();
        },
        status() {
            const data = load();
            const result = {};
            for (const [id, record] of Object.entries(data.keys)) {
                result[id] = !!(record && record.value);
            }
            return { secure: encryptionAvailable(), has: result };
        }
    };
}

module.exports = { createKeyStore };
