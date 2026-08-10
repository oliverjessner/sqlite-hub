import { sanitizeExportFilenameBase } from './exportFilenames.js';

const TEXT_TO_STRUCT_EXPORT_FORMATS = {
    json: { extension: 'json', label: 'JSON', mimeType: 'application/json;charset=utf-8' },
    jsonl: { extension: 'jsonl', label: 'JSONL', mimeType: 'application/x-ndjson;charset=utf-8' },
    csv: { extension: 'csv', label: 'CSV', mimeType: 'text/csv;charset=utf-8' },
    tsv: { extension: 'tsv', label: 'TSV', mimeType: 'text/tab-separated-values;charset=utf-8' },
    markdown: { extension: 'md', label: 'Markdown', mimeType: 'text/markdown;charset=utf-8' },
    yaml: { extension: 'yaml', label: 'YAML', mimeType: 'application/yaml;charset=utf-8' },
    sqlite: { extension: 'sql', label: 'SQLite SQL', mimeType: 'application/sql;charset=utf-8' },
};

export function buildTextToStructExport(format, { table = '' } = {}) {
    const normalizedFormat = String(format ?? '').toLowerCase();
    const metadata = TEXT_TO_STRUCT_EXPORT_FORMATS[normalizedFormat] ?? TEXT_TO_STRUCT_EXPORT_FORMATS.json;
    const preferredBase = normalizedFormat === 'sqlite' ? table : '';
    const filenameBase = sanitizeExportFilenameBase(preferredBase, 'text2struct-output');

    return {
        ...metadata,
        filename: `${filenameBase}.${metadata.extension}`,
        format: TEXT_TO_STRUCT_EXPORT_FORMATS[normalizedFormat] ? normalizedFormat : 'json',
    };
}
