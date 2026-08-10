const DOCUMENT_EXPORT_FORMATS = {
    md: { extension: 'md', mimeType: 'text/markdown;charset=utf-8' },
    txt: { extension: 'txt', mimeType: 'text/plain;charset=utf-8' },
};

function sanitizeDocumentFilenameBase(value) {
    return String(value ?? '')
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^\.+/, '')
        .replace(/\.(md|txt)$/i, '')
        .trim();
}

export function buildDocumentExport(filename, format = 'md') {
    const normalizedFormat = DOCUMENT_EXPORT_FORMATS[format] ? format : 'md';
    const metadata = DOCUMENT_EXPORT_FORMATS[normalizedFormat];
    const base = sanitizeDocumentFilenameBase(filename) || 'document';

    return {
        filename: `${base}.${metadata.extension}`,
        format: normalizedFormat,
        mimeType: metadata.mimeType,
    };
}
