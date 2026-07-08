export const MAX_CONNECTION_TAG_NAME_LENGTH = 40;

export function normalizeConnectionSearchQuery(query) {
    return String(query ?? '').trim().toLowerCase();
}

export function normalizeConnectionTagName(value) {
    const name = String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim();

    if (!name || name.length > MAX_CONNECTION_TAG_NAME_LENGTH) {
        return '';
    }

    return name;
}

export function normalizeConnectionTagKey(value) {
    return String(value ?? '').trim().toLowerCase();
}

function getConnectionFilename(connection = {}) {
    const segments = String(connection.path ?? '').split(/[\\/]/);
    return segments[segments.length - 1] ?? '';
}

function getConnectionSearchText(connection = {}) {
    const tagNames = Array.isArray(connection.tags)
        ? connection.tags.map(tag => tag?.name ?? '').join(' ')
        : '';

    return [
        connection.label,
        getConnectionFilename(connection),
        connection.path,
        tagNames,
    ]
        .map(value => String(value ?? '').toLowerCase())
        .join(' ');
}

export function filterConnections(connections = [], { searchQuery = '', selectedTagIds = [] } = {}) {
    const query = normalizeConnectionSearchQuery(searchQuery);
    const selectedTagSet = new Set(
        selectedTagIds
            .map(tagId => String(tagId ?? '').trim())
            .filter(Boolean),
    );

    return [...connections].filter(connection => {
        if (query && !getConnectionSearchText(connection).includes(query)) {
            return false;
        }

        if (!selectedTagSet.size) {
            return true;
        }

        return (connection.tags ?? []).some(tag => selectedTagSet.has(String(tag.id)));
    });
}

export function getConnectionTagCounts(connections = []) {
    const counts = new Map();

    for (const connection of connections) {
        const tagIds = new Set((connection.tags ?? []).map(tag => String(tag.id)));

        for (const tagId of tagIds) {
            counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
        }
    }

    return counts;
}
