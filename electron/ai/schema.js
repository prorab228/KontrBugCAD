'use strict';
/**
 * schema.js — приведение JSON Schema инструментов к подмножеству, которое
 * принимает GigaChat (он строже OpenAI: требует type у каждого узла,
 * properties у каждого object и не понимает oneOf/anyOf/allOf/массивы типов).
 *
 * Работает на глубокой копии: исходные схемы инструментов не мутируются.
 */

function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
}

function mergeAlternatives(alts) {
    const merged = { type: 'object', properties: {}, required: [] };
    for (const alt of alts) {
        if (!alt || typeof alt !== 'object') continue;
        if (alt.type === 'object' && alt.properties) {
            Object.assign(merged.properties, alt.properties);
            if (Array.isArray(alt.required)) merged.required.push(...alt.required);
        } else if (alt.type && !merged.type) {
            merged.type = alt.type;
        }
    }
    merged.required = [...new Set(merged.required)];
    if (!merged.required.length) delete merged.required;
    return merged;
}

function walk(schema) {
    if (!schema || typeof schema !== 'object') return schema;

    delete schema.$schema;
    delete schema.additionalProperties;
    delete schema.definitions;
    delete schema.nullable;

    // oneOf/anyOf/allOf → один объединённый object
    for (const comb of ['oneOf', 'anyOf', 'allOf']) {
        if (Array.isArray(schema[comb]) && schema[comb].length) {
            Object.assign(schema, mergeAlternatives(schema[comb]));
            delete schema[comb];
            break;
        }
    }

    if (Array.isArray(schema.type)) {
        schema.type = schema.type.find((t) => t !== 'null') || 'string';
    }
    if (schema.type === 'null') schema.type = 'string';

    if (!schema.type) {
        if (schema.properties) schema.type = 'object';
        else if (schema.items) schema.type = 'array';
        else if (schema.enum) schema.type = 'string';
        else schema.type = 'string';
    }

    if (schema.type === 'object' && !schema.properties) schema.properties = {};

    if (schema.properties && typeof schema.properties === 'object') {
        for (const key of Object.keys(schema.properties)) {
            walk(schema.properties[key]);
        }
    }
    if (schema.items) walk(schema.items);

    return schema;
}

/** Возвращает безопасную для GigaChat копию JSON Schema. */
function sanitizeGigaChatSchema(schema) {
    return walk(clone(schema));
}

module.exports = { sanitizeGigaChatSchema };
