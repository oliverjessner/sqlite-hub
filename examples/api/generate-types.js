const SQLITE_HUB_URL = process.env.SQLITE_HUB_URL || 'http://127.0.0.1:4173';
const apiToken = process.env.SQLITE_HUB_API_TOKEN;
const databaseId = process.env.SQLITE_HUB_DATABASE_ID || process.argv[2];
const tableName = process.env.SQLITE_HUB_TABLE || process.argv[3] || 'users';
const target = process.env.SQLITE_HUB_TYPE_TARGET || process.argv[4] || 'typescript';

if (!apiToken) {
    throw new Error('SQLITE_HUB_API_TOKEN is required.');
}

if (!databaseId) {
    throw new Error('Provide SQLITE_HUB_DATABASE_ID or pass the database id as the first argument.');
}

const url = [
    SQLITE_HUB_URL.replace(/\/$/, ''),
    'api/v1/databases',
    encodeURIComponent(databaseId),
    'tables',
    encodeURIComponent(tableName),
    'types',
].join('/');

const response = await fetch(url, {
    method: 'POST',
    headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        target,
        options: {
            propertyNaming: 'camel',
            nullableMode: 'native',
            includeComments: true,
            includeDefaultsAsComments: true,
        },
    }),
});

const payload = await response.json();

if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message || payload.message || 'Type generation failed.');
}

console.log(payload.data.code);

if (payload.warnings?.length) {
    console.error(payload.warnings.map(warning => `Warning: ${warning}`).join('\n'));
}
