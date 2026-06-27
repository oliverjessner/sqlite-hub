export const SYNTHETIC_GENERATOR_TYPES = [
    { value: 'skip', label: 'Skip' },
    { value: 'static', label: 'Static Value' },
    { value: 'randomText', label: 'Random Text' },
    { value: 'name', label: 'Name' },
    { value: 'firstName', label: 'First Name' },
    { value: 'lastName', label: 'Last Name' },
    { value: 'email', label: 'Email' },
    { value: 'username', label: 'Username' },
    { value: 'title', label: 'Title' },
    { value: 'slug', label: 'Slug' },
    { value: 'url', label: 'URL' },
    { value: 'randomInteger', label: 'Random Integer' },
    { value: 'randomDecimal', label: 'Random Decimal' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'timestamp', label: 'Timestamp' },
    { value: 'uuid', label: 'UUID' },
    { value: 'oneOf', label: 'One Of' },
];

const GENERATOR_VALUES = new Set(SYNTHETIC_GENERATOR_TYPES.map(type => type.value));

function normalizeColumnName(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase();
}

export function isIntegerPrimaryKeyColumn(column = {}) {
    return (
        Number(column.primaryKeyPosition ?? 0) > 0 &&
        (column.affinity === 'INTEGER' || /\bINT\b/i.test(column.declaredType ?? ''))
    );
}

export function normalizeSyntheticGeneratorType(value, fallback = 'skip') {
    const text = String(value ?? '');

    return GENERATOR_VALUES.has(text) ? text : fallback;
}

export function getSyntheticGeneratorLabel(value) {
    return SYNTHETIC_GENERATOR_TYPES.find(type => type.value === value)?.label ?? 'Skip';
}

export function getDefaultSyntheticOptions(generator, column = {}) {
    switch (generator) {
        case 'static':
            return { value: '' };
        case 'randomInteger':
            return { min: 1, max: 1000 };
        case 'randomDecimal':
            return { min: 0, max: 1000, decimals: 2 };
        case 'boolean':
            return { trueProbability: 50 };
        case 'timestamp':
            return { range: 'last30', from: '', to: '' };
        case 'oneOf':
            return { values: (column.allowedValues ?? []).join(', ') };
        default:
            return {};
    }
}

export function suggestSyntheticGeneratorForColumn(column = {}) {
    const name = normalizeColumnName(column.name);
    const declaredType = String(column.declaredType ?? '').toUpperCase();
    const affinity = String(column.affinity ?? '').toUpperCase();

    if (!column.visible || column.generated || affinity === 'BLOB') {
        return 'skip';
    }

    if (isIntegerPrimaryKeyColumn(column)) {
        return 'skip';
    }

    if ((column.allowedValues ?? []).length) {
        return 'oneOf';
    }

    if (/(^|_)email$/.test(name) || name.includes('email_address')) {
        return 'email';
    }

    if (/^(first_name|firstname|given_name)$/.test(name)) {
        return 'firstName';
    }

    if (/^(last_name|lastname|family_name|surname)$/.test(name)) {
        return 'lastName';
    }

    if (/^(name|full_name|display_name|contact_name)$/.test(name)) {
        return 'name';
    }

    if (/^(username|user_name|login)$/.test(name)) {
        return 'username';
    }

    if (/(^|_)(title|headline|subject)$/.test(name)) {
        return 'title';
    }

    if (/(^|_)slug$/.test(name)) {
        return 'slug';
    }

    if (/(^|_)(url|website|site|homepage)$/.test(name)) {
        return 'url';
    }

    if (/(^|_)(uuid|guid)$/.test(name)) {
        return 'uuid';
    }

    if (/(^is_|^has_|enabled$|active$|archived$|published$|deleted$|visible$)/.test(name)) {
        return 'boolean';
    }

    if (/(date|time|created_at|updated_at|timestamp)/.test(name) || /DATE|TIME/.test(declaredType)) {
        return 'timestamp';
    }

    if (affinity === 'INTEGER') {
        return 'randomInteger';
    }

    if (affinity === 'REAL' || affinity === 'NUMERIC' || /DECIMAL|NUMERIC/.test(declaredType)) {
        return 'randomDecimal';
    }

    if (affinity === 'TEXT') {
        return 'randomText';
    }

    return 'skip';
}

export function buildSyntheticDataMappings(columns = []) {
    return columns
        .filter(column => column.visible && !column.generated)
        .map(column => {
            const generator = suggestSyntheticGeneratorForColumn(column);

            return {
                columnName: column.name,
                generator,
                options: getDefaultSyntheticOptions(generator, column),
                note: isIntegerPrimaryKeyColumn(column) ? 'Auto increment / skipped' : '',
            };
        });
}
