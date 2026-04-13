#!/usr/bin/env node

const { spawn } = require('node:child_process');

const DEFAULT_PORT = 4173;

function printHelp() {
    console.log(`SQLite Hub CLI

Usage:
  sqlite-hub [--port:4173]

Options:
  --help                      Show this help text.
  --port:PORT                 Start the server on a custom port.
  --version                   Show the version number.
  --database                  List all imported databases.
  --database-path:name        Get the file path of a database by name.
  --database-size:name        Get the size of a database by name.
  --database-lastopened:name  Get the last opened timestamp of a database by name.
  --database-tables:name      Get all table names from a database.
  --database:name --sqleditor List all saved queries for a database.
  --database:name --sqleditor:"query"  Execute a saved query by name.
`);
}

function parsePort(rawValue) {
    const port = Number(rawValue);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${rawValue}`);
    }

    return port;
}

function parseCliArguments(argv) {
    let port;
    let databaseName = null;

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (argument === '--help' || argument === '-h') {
            return { help: true };
        }

        if (argument === '--database' || argument === '-d') {
            return { database: true };
        }

        if (argument.startsWith('--database:')) {
            databaseName = argument.slice('--database:'.length);
            continue;
        }

        if (argument.startsWith('--database-path:')) {
            return { databasePath: argument.slice('--database-path:'.length) };
        }

        if (argument.startsWith('--database-size:')) {
            return { databaseSize: argument.slice('--database-size:'.length) };
        }

        if (argument.startsWith('--database-lastopened:')) {
            return { databaseLastOpened: argument.slice('--database-lastopened:'.length) };
        }

        if (argument.startsWith('--database-tables:')) {
            return { databaseTables: argument.slice('--database-tables:'.length) };
        }

        if (argument === '--sqleditor') {
            return { sqlEditor: true, databaseName };
        }

        if (argument.startsWith('--sqleditor:')) {
            return { sqlEditorQuery: argument.slice('--sqleditor:'.length), databaseName };
        }

        if (argument.startsWith('--port:')) {
            port = parsePort(argument.slice('--port:'.length));
            continue;
        }

        if (argument.startsWith('--port=')) {
            port = parsePort(argument.slice('--port='.length));
            continue;
        }

        if (argument === '--port') {
            port = parsePort(argv[index + 1]);
            index += 1;
            continue;
        }

        if (argument === '--version' || argument === '-v') {
            const { version } = require('../package.json');
            console.log(`SQLite Hub CLI version ${version}`);
            process.exit(0);
        }

        throw new Error(`Unknown argument: ${argument}`);
    }

    return { help: false, port };
}

function openInDefaultBrowser(url) {
    const openers = {
        darwin: {
            command: 'open',
            args: [url],
        },
        win32: {
            command: 'cmd',
            args: ['/c', 'start', '', url],
            options: { windowsHide: true },
        },
        default: {
            command: 'xdg-open',
            args: [url],
        },
    };

    const opener = openers[process.platform] || openers.default;
    const child = spawn(opener.command, opener.args, {
        detached: true,
        stdio: 'ignore',
        ...opener.options,
    });

    child.on('error', error => {
        console.warn(`Could not open the browser automatically: ${error.message}`);
    });

    child.unref();
}

function findDatabaseByName(connections, name) {
    const normalizedName = name.toLowerCase();
    return connections.find(
        conn => conn.label.toLowerCase() === normalizedName || conn.id.toLowerCase() === normalizedName,
    );
}

function formatSize(bytes) {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
    const {
        help,
        database,
        databasePath,
        databaseSize,
        databaseLastOpened,
        databaseTables,
        sqlEditor,
        sqlEditorQuery,
        databaseName,
        port = DEFAULT_PORT,
    } = parseCliArguments(process.argv.slice(2));

    if (help) {
        printHelp();
        return;
    }

    const { resolveAppStatePaths } = require('../server/utils/appPaths');
    const { AppStateStore } = require('../server/services/storage/appStateStore');
    const path = require('path');

    const PACKAGE_ROOT = path.resolve(__dirname, '..');
    const { appStateDbPath: APP_STATE_DB_PATH } = resolveAppStatePaths(PACKAGE_ROOT);

    const appStateStore = new AppStateStore(APP_STATE_DB_PATH);
    const connections = appStateStore.getRecentConnections();

    if (databasePath) {
        const conn = findDatabaseByName(connections, databasePath);
        if (!conn) {
            console.error(`Database not found: ${databasePath}`);
            process.exit(1);
        }
        console.log(conn.path);
        return;
    }

    if (databaseSize) {
        const conn = findDatabaseByName(connections, databaseSize);
        if (!conn) {
            console.error(`Database not found: ${databaseSize}`);
            process.exit(1);
        }
        console.log(formatSize(conn.sizeBytes));
        return;
    }

    if (databaseLastOpened) {
        const conn = findDatabaseByName(connections, databaseLastOpened);
        if (!conn) {
            console.error(`Database not found: ${databaseLastOpened}`);
            process.exit(1);
        }
        console.log(conn.lastOpenedAt);
        return;
    }

    if (databaseTables) {
        const conn = findDatabaseByName(connections, databaseTables);
        if (!conn) {
            console.error(`Database not found: ${databaseTables}`);
            process.exit(1);
        }

        const Database = require('better-sqlite3');
        const db = new Database(conn.path, { readonly: true });

        try {
            const tables = db
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
                .all()
                .map(row => row.name);

            if (tables.length === 0) {
                console.log('No tables found in this database.');
            } else {
                console.log(`\nTables in ${conn.label} (${tables.length}):`);
                console.log('─'.repeat(60));
                tables.forEach((table, index) => {
                    console.log(`${index + 1}. ${table}`);
                });
                console.log('');
            }
        } finally {
            db.close();
        }
        return;
    }

    if (sqlEditor || sqlEditorQuery) {
        const dbName = databaseName || databasePath || databaseSize || databaseLastOpened || databaseTables;
        if (!dbName) {
            console.error('Error: --sqleditor requires a database name.');
            console.error('Usage: sqlite-hub --database:name --sqleditor');
            console.error('       sqlite-hub --database:name --sqleditor:"query name"');
            process.exit(1);
        }
        const conn = findDatabaseByName(connections, dbName);
        if (!conn) {
            console.error(`Database not found: ${dbName}`);
            process.exit(1);
        }

        const Database = require('better-sqlite3');
        const { SqlExecutor } = require('../server/services/sqlite/sqlExecutor');
        const { ConnectionManager } = require('../server/services/sqlite/connectionManager');

        const db = new Database(conn.path, { readonly: true });

        try {
            const connectionManager = new ConnectionManager({ appStateStore });
            connectionManager.openConnection({
                filePath: conn.path,
                label: conn.label,
                makeActive: true,
                readOnly: true,
            });

            const sqlExecutor = new SqlExecutor({ connectionManager, appStateStore });

            if (sqlEditorQuery) {
                const queryHistory = appStateStore.buildQueryHistoryCollection({
                    databaseKey: conn.id,
                    search: sqlEditorQuery,
                    onlySaved: false,
                    limit: 100,
                });

                const matchingQuery = queryHistory.items.find(
                    item =>
                        item.title?.toLowerCase() === sqlEditorQuery.toLowerCase() ||
                        item.rawSql.toLowerCase().includes(sqlEditorQuery.toLowerCase()),
                );

                if (!matchingQuery) {
                    console.error(`Saved query not found: ${sqlEditorQuery}`);
                    console.error('\nAvailable saved queries:');
                    const allQueries = appStateStore.buildQueryHistoryCollection({
                        databaseKey: conn.id,
                        onlySaved: true,
                        limit: 100,
                    });
                    if (allQueries.items.length > 0) {
                        allQueries.items.forEach(q => {
                            console.log(`  - ${q.title || q.displayTitle}`);
                        });
                    } else {
                        console.log('  (none)');
                    }
                    process.exit(1);
                }

                console.log(`\nExecuting: ${matchingQuery.title || matchingQuery.displayTitle}`);
                console.log(`SQL: ${matchingQuery.previewSql}`);
                console.log('─'.repeat(60));

                const result = sqlExecutor.execute(matchingQuery.rawSql, {
                    persistHistory: false,
                });

                console.log(`\nStatement count: ${result.statementCount}`);
                console.log(`Timing: ${result.timingMs}ms`);

                result.statements.forEach((stmt, index) => {
                    console.log(`\nStatement ${index + 1} (${stmt.kind}):`);
                    if (stmt.kind === 'resultSet') {
                        console.log(`Rows: ${stmt.rowCount}`);
                        console.log(`Columns: ${stmt.columns.join(', ')}`);
                        if (stmt.rows.length > 0) {
                            console.log('\nResults:');
                            stmt.rows.forEach((row, rowIndex) => {
                                const values = stmt.columns.map(col => {
                                    const val = row[col];
                                    return val === null ? 'NULL' : String(val);
                                });
                                console.log(`  [${rowIndex}] ${values.join(' | ')}`);
                            });
                        }
                    } else if (stmt.kind === 'mutation') {
                        console.log(`Changes: ${stmt.changes}`);
                        if (stmt.lastInsertRowid) {
                            console.log(`Last insert rowid: ${stmt.lastInsertRowid}`);
                        }
                    }
                });
            } else {
                const savedQueries = appStateStore.buildQueryHistoryCollection({
                    databaseKey: conn.id,
                    onlySaved: true,
                    limit: 100,
                });

                if (savedQueries.items.length === 0) {
                    console.log(`No saved queries found for ${conn.label}.`);
                } else {
                    console.log(`\nSaved queries for ${conn.label} (${savedQueries.total}):`);
                    console.log('─'.repeat(60));
                    savedQueries.items.forEach((q, index) => {
                        const title = q.title || q.displayTitle;
                        console.log(`${index + 1}. ${title}`);
                    });
                    console.log('');
                }
            }
        } finally {
            db.close();
        }
        return;
    }

    if (database) {
        if (connections.length === 0) {
            console.log('No databases imported yet.');
            return;
        }

        console.log(`\nImported databases (${connections.length}):`);
        console.log('─'.repeat(60));

        connections.forEach((conn, index) => {
            const size = formatSize(conn.sizeBytes);
            const readOnly = conn.readOnly ? ' (read-only)' : '';
            console.log(`${index + 1}. ${conn.label}${readOnly}`);
            console.log(`   Path: ${conn.path}`);
            console.log(`   Size: ${size}`);
            console.log(`   Last opened: ${conn.lastOpenedAt}`);
            console.log('');
        });

        return;
    }

    const { startServer } = require('../server/server');
    const { url } = await startServer({ port });
    openInDefaultBrowser(url);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    main,
    openInDefaultBrowser,
    parseCliArguments,
};
