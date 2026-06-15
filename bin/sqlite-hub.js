#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
    DatabaseCommandService,
    getQueryTitle,
} = require('../server/services/databaseCommandService');

const DEFAULT_PORT = 4173;
const EXPORT_FORMATS = new Set(['csv', 'tsv', 'md']);

function printHelp() {
    console.log(`SQLite Hub CLI

Usage:
  sqlite-hub [--port:4173]
  sqlite-hub --database
  sqlite-hub --database:"name" --tables
  sqlite-hub --database:"name" --execute:"Saved Query"
  sqlite-hub --database:"name" --query:"Saved Query"
  sqlite-hub --database:"name" --notes:"Saved Query"
  sqlite-hub --database:"name" --export:"Saved Query" --format:csv
  sqlite-hub --database:"name" --documents
  sqlite-hub --database:"name" --documents:"Document Name"
  sqlite-hub --database:"name" --documents:"Document Name" --export
  sqlite-hub --database:"name" --table:"table_name"
  sqlite-hub --database:"name" --table:"table_name" --export:"primary-key"

Options:
  --help, -h                         Show this help text.
  --version, -v                      Show the version number.
  --config                           Show CLI port, URL, app version, and SQLite version.
  --open                             Start/open SQLite Hub in the browser.
  --port:PORT                        Start the server on a custom port.
  --database, -d                     List all imported databases.
  --database:"name"                  Select an imported database by name or id.
  --path                             Print the selected database file path.
  --size                             Print the selected database file size.
  --lastopened                       Print the selected database last-opened timestamp.
  --tables                           List tables in the selected database.
  --queries                          List saved SQL Editor queries for the selected database.
  --execute:"query"                  Execute a saved SQL Editor query by name.
  --query:"query"                    Print a saved SQL Editor query by name.
  --notes:"query"                    Print notes for a saved SQL Editor query by name.
  --export:"query"                   Export a saved query when --table is not set.
  --format:csv|tsv|md                Export format for query exports. Defaults to csv.
  --documents                        List Markdown documents for the selected database.
  --documents:"name"                 Print a document's Markdown content.
  --documents:"name" --export        Export a document as a Markdown file.
  --table:"table"                    Print table metadata.
  --table:"table" --export:"pk"      Export one row as JSON by primary key or rowid.

Legacy aliases still work:
  --database-path:name, --database-size:name, --database-lastopened:name
  --database-tables:name, --database:name --sqleditor, --database:name --sqleditor:"query"
`);
}

function parsePort(rawValue) {
    const port = Number(rawValue);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${rawValue}`);
    }

    return port;
}

function splitArgument(argument) {
    const colonIndex = argument.indexOf(':');
    const equalsIndex = argument.indexOf('=');
    const separators = [colonIndex, equalsIndex].filter(index => index > -1);

    if (separators.length === 0) {
        return {
            flag: normalizeFlagName(argument),
            value: undefined,
        };
    }

    const separatorIndex = Math.min(...separators);

    return {
        flag: normalizeFlagName(argument.slice(0, separatorIndex)),
        value: argument.slice(separatorIndex + 1),
    };
}

function normalizeFlagName(flag) {
    if (flag === '---path') {
        return '--path';
    }

    return flag;
}

function takeFlagValue(flag, inlineValue, argv, index) {
    if (inlineValue !== undefined) {
        return {
            value: inlineValue,
            nextIndex: index,
        };
    }

    const nextValue = argv[index + 1];

    if (nextValue === undefined || nextValue.startsWith('--')) {
        throw new Error(`${flag} requires a value.`);
    }

    return {
        value: nextValue,
        nextIndex: index + 1,
    };
}

function takeOptionalFlagValue(inlineValue, argv, index) {
    if (inlineValue !== undefined) {
        return {
            hasValue: true,
            value: inlineValue,
            nextIndex: index,
        };
    }

    const nextValue = argv[index + 1];

    if (nextValue === undefined || nextValue.startsWith('--')) {
        return {
            hasValue: false,
            value: null,
            nextIndex: index,
        };
    }

    return {
        hasValue: true,
        value: nextValue,
        nextIndex: index + 1,
    };
}

function normalizeExportFormat(format) {
    const normalized = String(format ?? 'csv').toLowerCase();

    if (!EXPORT_FORMATS.has(normalized)) {
        throw new Error(`Unsupported export format: ${format}. Use csv, tsv, or md.`);
    }

    return normalized;
}

function parseCliArguments(argv) {
    const options = {
        help: false,
        version: false,
        config: false,
        open: false,
        port: undefined,
        databaseList: false,
        databaseName: null,
        pathInfo: false,
        sizeInfo: false,
        lastOpenedInfo: false,
        tables: false,
        queries: false,
        executeQuery: null,
        showQuery: null,
        showNotes: null,
        exportTarget: null,
        exportFormat: 'csv',
        documents: false,
        documentName: null,
        documentExport: false,
        tableName: null,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const { flag, value } = splitArgument(argument);

        if (flag === '--help' || flag === '-h') {
            options.help = true;
            continue;
        }

        if (flag === '--version' || flag === '-v') {
            options.version = true;
            continue;
        }

        if (flag === '--config') {
            options.config = true;
            continue;
        }

        if (flag === '--open') {
            options.open = true;
            continue;
        }

        if (flag === '--port') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.port = parsePort(parsed.value);
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--database' || flag === '-d') {
            const parsed = takeOptionalFlagValue(value, argv, index);

            if (parsed.hasValue) {
                options.databaseName = parsed.value;
            } else {
                options.databaseList = true;
            }

            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--database-path') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.databaseName = parsed.value;
            options.pathInfo = true;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--database-size') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.databaseName = parsed.value;
            options.sizeInfo = true;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--database-lastopened') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.databaseName = parsed.value;
            options.lastOpenedInfo = true;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--database-tables') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.databaseName = parsed.value;
            options.tables = true;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--path') {
            options.pathInfo = true;
            continue;
        }

        if (flag === '--size') {
            options.sizeInfo = true;
            continue;
        }

        if (flag === '--lastopened') {
            options.lastOpenedInfo = true;
            continue;
        }

        if (flag === '--tables') {
            options.tables = true;
            continue;
        }

        if (flag === '--queries') {
            options.queries = true;
            continue;
        }

        if (flag === '--sqleditor') {
            const parsed = takeOptionalFlagValue(value, argv, index);

            if (parsed.hasValue) {
                options.executeQuery = parsed.value;
            } else {
                options.queries = true;
            }

            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--execute') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.executeQuery = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--query') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.showQuery = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--notes') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.showNotes = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--documents') {
            const parsed = takeOptionalFlagValue(value, argv, index);

            options.documents = true;
            if (parsed.hasValue) {
                const rawDocumentName = String(parsed.value ?? '');

                if (rawDocumentName.endsWith('--export')) {
                    options.documentName = rawDocumentName.slice(0, -'--export'.length);
                    options.documentExport = true;
                } else {
                    options.documentName = rawDocumentName;
                }
            }

            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--documents-export') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.documents = true;
            options.documentName = parsed.value;
            options.documentExport = true;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--export') {
            if (options.documents && options.documentName && value === undefined) {
                const nextValue = argv[index + 1];

                if (nextValue === undefined || nextValue.startsWith('--')) {
                    options.documentExport = true;
                    continue;
                }
            }

            const parsed = takeFlagValue(flag, value, argv, index);
            options.exportTarget = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--format') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.exportFormat = normalizeExportFormat(parsed.value);
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--table') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.tableName = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        throw new Error(`Unknown argument: ${argument}`);
    }

    return options;
}

function hasDatabaseOperation(options) {
    return Boolean(
        options.pathInfo ||
            options.sizeInfo ||
            options.lastOpenedInfo ||
            options.tables ||
            options.queries ||
            options.executeQuery ||
            options.showQuery ||
            options.showNotes ||
            options.documents ||
            options.documentName ||
            options.documentExport ||
            options.exportTarget ||
            options.tableName,
    );
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

function formatSize(bytes) {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createAppStateStore() {
    const { resolveAppStatePaths } = require('../server/utils/appPaths');
    const { AppStateStore } = require('../server/services/storage/appStateStore');
    const packageRoot = path.resolve(__dirname, '..');
    const { appStateDbPath } = resolveAppStatePaths(packageRoot);

    return new AppStateStore(appStateDbPath);
}

function printDatabaseList(connections) {
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
}

function printSingleDatabaseInfo(conn) {
    const readOnly = conn.readOnly ? 'yes' : 'no';

    console.log(`Database: ${conn.label}`);
    console.log(`Path: ${conn.path}`);
    console.log(`Size: ${formatSize(conn.sizeBytes)}`);
    console.log(`Last opened: ${conn.lastOpenedAt}`);
    console.log(`Read-only: ${readOnly}`);
}

function printTables(conn, tables) {
    if (tables.length === 0) {
        console.log('No tables found in this database.');
        return;
    }

    console.log(`\nTables in ${conn.label} (${tables.length}):`);
    console.log('─'.repeat(60));

    tables.forEach((table, index) => {
        console.log(`${index + 1}. ${table.name ?? table}`);
    });

    console.log('');
}

function listSavedQueries(databaseService, conn) {
    const savedQueries = databaseService.listSavedQueries(conn.id);

    if (savedQueries.items.length === 0) {
        console.log(`No saved queries found for ${conn.label}.`);
        return;
    }

    console.log(`\nSaved queries for ${conn.label} (${savedQueries.total}):`);
    console.log('─'.repeat(60));

    savedQueries.items.forEach((query, index) => {
        console.log(`${index + 1}. ${getQueryTitle(query)}`);
    });

    console.log('');
}

function formatCellValue(value) {
    if (value === null) {
        return 'NULL';
    }

    if (value && typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
}

function printExecutionResult(result) {
    console.log(`\nStatement count: ${result.statementCount}`);
    console.log(`Timing: ${result.timingMs}ms`);

    result.statements.forEach((statement, index) => {
        console.log(`\nStatement ${index + 1} (${statement.kind}):`);

        if (statement.kind === 'resultSet') {
            console.log(`Rows: ${statement.rowCount}`);
            console.log(`Columns: ${statement.columns.join(', ')}`);

            if (statement.rows.length > 0) {
                console.log('\nResults:');
                statement.rows.forEach((row, rowIndex) => {
                    const values = statement.columns.map(column => formatCellValue(row[column]));
                    console.log(`  [${rowIndex}] ${values.join(' | ')}`);
                });
            }

            return;
        }

        if (statement.kind === 'mutation') {
            console.log(`Changes: ${statement.changes}`);

            if (statement.lastInsertRowid) {
                console.log('Last insert rowid:', statement.lastInsertRowid);
            }
        }
    });
}

function executeSavedQuery({ databaseService, conn, queryName }) {
    const { query: matchingQuery, result } = databaseService.executeSavedQuery(conn.id, queryName);

    console.log(`\nExecuting: ${getQueryTitle(matchingQuery)}`);
    console.log(`SQL: ${matchingQuery.previewSql || matchingQuery.rawSql}`);
    console.log('─'.repeat(60));

    printExecutionResult(result);
}

function showSavedQuery({ databaseService, conn, queryName }) {
    const matchingQuery = databaseService.getSavedQuery(conn.id, queryName);

    console.log(matchingQuery.rawSql);
}

function showSavedQueryNotes({ databaseService, conn, queryName }) {
    const matchingQuery = databaseService.getSavedQuery(conn.id, queryName);
    const notes = String(matchingQuery.notes ?? '').trim();

    if (notes) {
        console.log(notes);
        return;
    }

    console.log(`No notes saved for: ${getQueryTitle(matchingQuery)}`);
}

function exportSavedQuery({ databaseService, conn, queryName, format }) {
    const { query: matchingQuery, result } = databaseService.exportSavedQuery(conn.id, queryName, format);
    const outputPath = path.resolve(process.cwd(), result.filename);

    fs.writeFileSync(outputPath, result.content, 'utf8');

    console.log(`Exported query: ${getQueryTitle(matchingQuery)}`);
    console.log(`Format: ${result.format}`);
    console.log(`Rows: ${result.rowCount}`);
    console.log(`File: ${outputPath}`);
}

function listDocuments(databaseService, conn) {
    const documents = databaseService.listDocuments(conn.id);

    if (documents.length === 0) {
        console.log(`No documents found for ${conn.label}.`);
        return;
    }

    console.log(`\nDocuments for ${conn.label} (${documents.length}):`);
    console.log('─'.repeat(60));

    documents.forEach((document, index) => {
        console.log(`${index + 1}. ${document.filename}`);
        console.log(`   Updated: ${document.updatedAt}`);
        console.log(`   Characters: ${document.contentLength}`);
    });

    console.log('');
}

function showDocumentMarkdown({ databaseService, conn, documentName }) {
    const matchingDocument = databaseService.getDocument(conn.id, documentName);

    console.log(matchingDocument.content ?? '');
}

function exportDocumentMarkdown({ databaseService, conn, documentName }) {
    const result = databaseService.exportDocument(conn.id, documentName);
    const outputPath = path.resolve(process.cwd(), result.filename);

    fs.writeFileSync(outputPath, result.content, 'utf8');

    console.log(`Exported document: ${result.document.filename}`);
    console.log(`Characters: ${result.document.contentLength}`);
    console.log(`File: ${outputPath}`);
}
function exportTableRowAsJson({ databaseService, conn, tableName, exportTarget }) {
    const result = databaseService.getTableRow(conn.id, tableName, exportTarget);
    const outputPath = path.resolve(process.cwd(), result.filename);

    fs.writeFileSync(outputPath, `${JSON.stringify(result.data, null, 2)}\n`, 'utf8');

    console.log(`Exported row: ${tableName}`);
    console.log(`Key: ${exportTarget}`);
    console.log(`File: ${outputPath}`);
}

function formatColumnFlags(column, foreignKeyColumns) {
    const flags = [];

    if (column.primaryKeyPosition > 0) {
        flags.push(`PK${column.primaryKeyPosition > 1 ? `:${column.primaryKeyPosition}` : ''}`);
    }

    if (foreignKeyColumns.has(column.name)) {
        flags.push('FK');
    }

    if (column.notNull) {
        flags.push('NOT NULL');
    }

    if (column.generated) {
        flags.push('GENERATED');
    }

    return flags.length ? ` [${flags.join(', ')}]` : '';
}

function printTableInfo(tableDetail) {
    const foreignKeyColumns = new Set(
        tableDetail.foreignKeys.flatMap(foreignKey => foreignKey.mappings.map(mapping => mapping.from)),
    );

    console.log(`Table: ${tableDetail.name}`);
    console.log(`Rows: ${tableDetail.rowCount ?? 'N/A'}`);
    console.log(`Identity: ${tableDetail.identityStrategy.type}`);
    console.log(`Columns: ${tableDetail.columns.filter(column => column.visible).length}`);
    console.log('');

    tableDetail.columns
        .filter(column => column.visible)
        .forEach(column => {
            const type = column.declaredType || column.affinity || 'ANY';
            console.log(`  - ${column.name} ${type}${formatColumnFlags(column, foreignKeyColumns)}`);
        });

    if (tableDetail.foreignKeys.length > 0) {
        console.log('');
        console.log(`Foreign keys: ${tableDetail.foreignKeys.length}`);
        tableDetail.foreignKeys.forEach(foreignKey => {
            const mapping = foreignKey.mappings.map(item => `${item.from} -> ${item.to}`).join(', ');
            console.log(`  - ${mapping} (${foreignKey.referencedTable})`);
        });
    }

    if (tableDetail.indexes.length > 0) {
        console.log('');
        console.log(`Indexes: ${tableDetail.indexes.length}`);
        tableDetail.indexes.forEach(index => {
            const unique = index.unique ? ' UNIQUE' : '';
            const columns = index.columns.map(column => column.name).filter(Boolean).join(', ') || 'expression';
            console.log(`  - ${index.name}${unique}: ${columns}`);
        });
    }
}

function printConfig(port) {
    const Database = require('better-sqlite3');
    const { version } = require('../package.json');
    const db = new Database(':memory:');

    try {
        const sqliteVersion = db.prepare('SELECT sqlite_version() AS version').get().version;
        const url = `http://127.0.0.1:${port}`;

        console.log('SQLite Hub config');
        console.log(`Port: ${port}`);
        console.log(`URL: ${url}`);
        console.log(`App version: ${version}`);
        console.log(`SQLite version: ${sqliteVersion}`);
    } finally {
        db.close();
    }
}

async function startAndOpen(port) {
    const { startServer } = require('../server/server');
    const fallbackUrl = `http://127.0.0.1:${port}`;

    try {
        const { url } = await startServer({ port });
        openInDefaultBrowser(url);
    } catch (error) {
        if (error.code === 'EADDRINUSE') {
            console.warn(`Server already appears to be running on ${fallbackUrl}`);
            openInDefaultBrowser(fallbackUrl);
            return;
        }

        throw error;
    }
}

function requireDatabaseName(options) {
    if (!options.databaseName) {
        console.error('Error: this command requires --database:"name".');
        process.exit(1);
    }

    return options.databaseName;
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
    const options = parseCliArguments(argv);
    const port = options.port ?? DEFAULT_PORT;

    if (options.help) {
        printHelp();
        return;
    }

    if (options.version) {
        const { version } = require('../package.json');
        console.log(`SQLite Hub CLI version ${version}`);
        return;
    }

    if (options.config) {
        printConfig(port);
        return;
    }

    if (options.open) {
        await startAndOpen(port);
        return;
    }

    const databaseService =
        dependencies.databaseService ??
        new DatabaseCommandService({
            appStateStore: dependencies.appStateStore ?? createAppStateStore(),
        });
    const connections = databaseService.listDatabases();

    if (options.databaseList && !options.databaseName && !hasDatabaseOperation(options)) {
        printDatabaseList(connections);
        return;
    }

    if (options.databaseName || hasDatabaseOperation(options)) {
        const dbName = requireDatabaseName(options);
        const conn = databaseService.getDatabase(dbName);

        if (options.documents) {
            if (options.documentName) {
                if (options.documentExport) {
                    exportDocumentMarkdown({
                        databaseService,
                        conn,
                        documentName: options.documentName,
                    });
                } else {
                    showDocumentMarkdown({
                        databaseService,
                        conn,
                        documentName: options.documentName,
                    });
                }
                return;
            }

            listDocuments(databaseService, conn);
            return;
        }

        if (options.tableName || options.tables || options.queries || options.executeQuery || options.showQuery || options.showNotes || options.exportTarget) {
            if (options.tableName) {
                if (options.exportTarget) {
                    exportTableRowAsJson({
                        databaseService,
                        conn,
                        tableName: options.tableName,
                        exportTarget: options.exportTarget,
                    });
                } else {
                    printTableInfo(databaseService.getTable(conn.id, options.tableName));
                }

                return;
            }

            if (options.exportTarget) {
                exportSavedQuery({
                    databaseService,
                    conn,
                    queryName: options.exportTarget,
                    format: options.exportFormat,
                });
                return;
            }

            if (options.executeQuery) {
                executeSavedQuery({
                    databaseService,
                    conn,
                    queryName: options.executeQuery,
                });
                return;
            }

            if (options.showQuery) {
                showSavedQuery({ databaseService, conn, queryName: options.showQuery });
                return;
            }

            if (options.showNotes) {
                showSavedQueryNotes({ databaseService, conn, queryName: options.showNotes });
                return;
            }

            if (options.queries) {
                listSavedQueries(databaseService, conn);
                return;
            }

            if (options.tables) {
                printTables(conn, databaseService.listTables(conn.id));
                return;
            }
        }

        if (options.pathInfo) {
            console.log(conn.path);
            return;
        }

        if (options.sizeInfo) {
            console.log(formatSize(conn.sizeBytes));
            return;
        }

        if (options.lastOpenedInfo) {
            console.log(conn.lastOpenedAt);
            return;
        }

        printSingleDatabaseInfo(conn);
        return;
    }

    if (options.databaseList) {
        printDatabaseList(connections);
        return;
    }

    await startAndOpen(port);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    main,
    normalizeExportFormat,
    openInDefaultBrowser,
    parseCliArguments,
};
