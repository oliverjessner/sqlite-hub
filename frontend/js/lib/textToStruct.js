export const TEXT_TO_STRUCT_FIELD_TYPES = ['string', 'integer', 'float', 'boolean', 'date', 'array'];

const PROPERTY_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function getTextToStructFieldNames(fields = []) {
    return fields.map(field => String(field?.name ?? '').trim()).filter(Boolean);
}

export function validateTextToStructFields(fields = []) {
    if (!Array.isArray(fields) || fields.length === 0) {
        return {
            valid: false,
            message: 'ADD AT LEAST ONE PROPERTY',
            duplicateNames: [],
        };
    }

    const names = getTextToStructFieldNames(fields);

    if (names.length !== fields.length) {
        return {
            valid: false,
            message: 'PROPERTY NAME REQUIRED',
            duplicateNames: [],
        };
    }

    const invalidName = names.find(name => !PROPERTY_NAME_PATTERN.test(name));

    if (invalidName) {
        return {
            valid: false,
            message: `INVALID PROPERTY: ${invalidName}`,
            duplicateNames: [],
        };
    }

    const seen = new Set();
    const duplicates = new Set();

    for (const name of names) {
        if (seen.has(name)) {
            duplicates.add(name);
        }
        seen.add(name);
    }

    if (duplicates.size > 0) {
        const duplicateNames = [...duplicates];
        return {
            valid: false,
            message: `DUPLICATE PROPERTY: ${duplicateNames.join(', ')}`,
            duplicateNames,
        };
    }

    return {
        valid: true,
        message: '',
        duplicateNames: [],
    };
}
