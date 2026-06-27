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
    { value: 'existingForeignKey', label: 'Existing FK' },
];

const GENERATOR_VALUES = new Set(SYNTHETIC_GENERATOR_TYPES.map(type => type.value));

function normalizeColumnName(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase();
}

function hasBooleanAllowedValues(column = {}) {
    const values = (column.allowedValues ?? []).map(value => String(value));
    const uniqueValues = new Set(values);

    return uniqueValues.size === 2 && uniqueValues.has('0') && uniqueValues.has('1');
}

function hasBooleanIntegerRange(column = {}) {
    return Number(column.integerRange?.min) === 0 && Number(column.integerRange?.max) === 1;
}

function isBooleanLikeColumn(column = {}, normalizedName = '') {
    return (
        /(^is_|^has_|enabled$|active$|archived$|published$|deleted$|visible$|boolean|bool)/.test(normalizedName) ||
        hasBooleanAllowedValues(column) ||
        hasBooleanIntegerRange(column)
    );
}

function getForeignKeyInfo(foreignKeys = [], columnName) {
    const singleColumnForeignKey = foreignKeys.find(
        foreignKey =>
            (foreignKey.mappings?.length ?? 0) === 1 && foreignKey.mappings?.[0]?.from === columnName,
    );

    if (singleColumnForeignKey) {
        return {
            kind: 'single',
            foreignKey: singleColumnForeignKey,
            mapping: singleColumnForeignKey.mappings[0],
        };
    }

    const compositeForeignKey = foreignKeys.find(foreignKey =>
        (foreignKey.mappings ?? []).some(mapping => mapping.from === columnName),
    );

    if (compositeForeignKey) {
        return {
            kind: 'composite',
            foreignKey: compositeForeignKey,
            mapping: compositeForeignKey.mappings.find(mapping => mapping.from === columnName) ?? null,
        };
    }

    return null;
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

function normalizeIntegerRange(column = {}) {
    const min = Number(column.integerRange?.min);
    const max = Number(column.integerRange?.max);

    return {
        min: Number.isSafeInteger(min) ? min : null,
        max: Number.isSafeInteger(max) ? max : null,
    };
}

function getDefaultIntegerOptions(column = {}) {
    const range = normalizeIntegerRange(column);
    const min = range.min ?? (range.max !== null && range.max < 1 ? range.max - 999 : 1);
    const max = range.max ?? (range.min !== null && range.min > 1000 ? range.min + 999 : 1000);

    return { min, max };
}

export function getDefaultSyntheticOptions(generator, column = {}) {
    switch (generator) {
        case 'static':
            return { value: '' };
        case 'randomInteger':
            return getDefaultIntegerOptions(column);
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

export function suggestSyntheticGeneratorForColumn(column = {}, foreignKeys = []) {
    const name = normalizeColumnName(column.name);
    const declaredType = String(column.declaredType ?? '').toUpperCase();
    const affinity = String(column.affinity ?? '').toUpperCase();

    if (!column.visible || column.generated || affinity === 'BLOB') {
        return 'skip';
    }

    if (isIntegerPrimaryKeyColumn(column)) {
        return 'skip';
    }

    const foreignKeyInfo = getForeignKeyInfo(foreignKeys, column.name);

    if (foreignKeyInfo?.kind === 'single') {
        return 'existingForeignKey';
    }

    if (foreignKeyInfo?.kind === 'composite') {
        return 'skip';
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

    if (isBooleanLikeColumn(column, name)) {
        return 'boolean';
    }

    if ((column.allowedValues ?? []).length) {
        return 'oneOf';
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

export function buildSyntheticDataMappings(columns = [], foreignKeys = []) {
    return columns
        .filter(column => column.visible && !column.generated)
        .map(column => {
            const foreignKeyInfo = getForeignKeyInfo(foreignKeys, column.name);
            const generator = suggestSyntheticGeneratorForColumn(column, foreignKeys);
            const note =
                foreignKeyInfo?.kind === 'single'
                    ? `Existing ${foreignKeyInfo.foreignKey.referencedTable}.${foreignKeyInfo.mapping.to}`
                    : foreignKeyInfo?.kind === 'composite'
                      ? 'Composite FK unsupported'
                      : isIntegerPrimaryKeyColumn(column)
                        ? 'Auto increment / skipped'
                        : '';

            return {
                columnName: column.name,
                generator,
                options: getDefaultSyntheticOptions(generator, column),
                note,
            };
        });
}
