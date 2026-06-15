const SQLITE_HUB_URL = 'http://127.0.0.1:4180';
// Create a new token for your database in Settings > API Tokens.
const apiToken = 'shub_Lv9A2xocv01PqT6a0jEmuT-PxPyqfzI_UBaY_VEzjqE';
const DATABASE_ID = 'conn_ae9b5e54ae8eca1d';
const path = `${SQLITE_HUB_URL}/api/v1/databases/${DATABASE_ID}`;

async function databaseInfo(path) {
    console.log(path);
    const response = await fetch(path, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${apiToken}`,
        },
    });

    return await response.json();
}

const info = await databaseInfo(path);
const tables = await databaseInfo(`${path}/tables`);

console.log(info.data);
console.log(tables.data.items);

const row = await databaseInfo(`${path}/tables/${tables.data.items[0].name}`);

console.log(row.data);
