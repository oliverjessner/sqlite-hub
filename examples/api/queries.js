const SQLITE_HUB_URL = 'http://127.0.0.1:4180';
// Create a new token for your database in Settings > API Tokens.
const apiToken = 'shub_Lv9A2xocv01PqT6a0jEmuT-PxPyqfzI_UBaY_VEzjqE';
const DATABASE_ID = 'conn_ae9b5e54ae8eca1d';
const path = `${SQLITE_HUB_URL}/api/v1/databases/${DATABASE_ID}`;

async function databaseInfo(path, { method = 'GET' } = {}) {
    console.log(path);
    const response = await fetch(path, {
        method,
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${apiToken}`,
        },
    });
    return await response.json();
}

const queries = await databaseInfo(`${path}/queries`);

console.log(queries.data.items.map(query => query.displayTitle));

const queryName = encodeURIComponent(queries.data.items[0].displayTitle);
const query = await databaseInfo(`${path}/queries/${queryName}`);

console.log(query.data);

// Executing a saved query changes server state and therefore requires POST.
const exec = await databaseInfo(`${path}/queries/${queryName}/execute`, { method: 'POST' });

console.log(exec.data);
