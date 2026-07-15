#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseCommandService, getQueryTitle } = require('../server/services/databaseCommandService');
const { buildAppInfo } = require('../server/services/appInfoService');
const { FILE_EXTENSIONS } = require('../server/services/typeGenerationService');

const DEFAULT_PORT = 4173;
const EXPORT_FORMATS = new Set(['csv', 'tsv', 'md', 'json']);

function printHelp() {
    console.log(`SQLite Hub CLI

Usage:
  sqlite-hub [--port:4173]
  sqlite-hub --database
  sqlite-hub --database:"name" --tables
  sqlite-hub --database:"name" --query:"SELECT * FROM table_name"
  sqlite-hub --database:"name" --query:"SELECT * FROM table_name" --store:"Query Name"
  sqlite-hub --database:"name" --execute:"Saved Query"
  sqlite-hub --database:"name" --saved-query:"Saved Query"
  sqlite-hub --database:"name" --notes:"Saved Query"
  sqlite-hub --database:"name" --export:"Saved Query" --format:csv
  sqlite-hub --database:"name" --documents
  sqlite-hub --database:"name" --documents:"Document Name"
  sqlite-hub --database:"name" --documents:"Document Name" --export
  sqlite-hub --database:"name" --backups
  sqlite-hub --database:"name" --backup
  sqlite-hub --database:"name" --backup:"Before migration"
  sqlite-hub --database:"name" --table:"table_name"
  sqlite-hub --database:"name" --table:"table_name" --export:"primary-key"
  sqlite-hub --database:"name" --table:"table_name" --types:typescript

Options:
  --help, -h                         Show this help text.
  --version, -v                      Show the version number.
  --info                             Show port, URL, app version, SQLite version, and update status.
  --open                             Start/open SQLite Hub in the browser.
  --port:PORT                        Start the server on a custom port.
  --database, -d                     List all imported databases.
  --database:"name"                  Select an imported database by name or id.
  --path                             Print the selected database file path.
  --size                             Print the selected database file size.
  --lastopened                       Print the selected database last-opened timestamp.
  --tables                           List tables in the selected database.
  --queries                          List saved SQL Editor queries for the selected database.
  --query:"sql"                      Execute raw SQL and record it in query history.
  --store:"name"                     Save a raw --query history item with this name.
  --execute:"query"                  Execute a saved SQL Editor query by name.
  --saved-query:"query"              Print a saved SQL Editor query by name.
  --notes:"query"                    Print notes for a saved SQL Editor query by name.
  --export:"query"                   Export a saved query when --table is not set.
  --format:csv|tsv|md|json           Export format for query exports. Defaults to csv.
  --documents                        List Markdown documents for the selected database.
  --documents:"name"                 Print a document's Markdown content.
  --documents:"name" --export        Export a document as a Markdown file.
  --backups                          List managed backups for the selected database.
  --backup                           Create and verify a managed backup.
  --backup:"name"                    Create a backup with a custom name.
  --backup-notes:"text"              Add notes to a created backup.
  --table:"table"                    Print table metadata.
  --table:"table" --export:"pk"      Export one row as JSON by primary key or rowid.
  --types:typescript|ts|rust|rs|kotlin|kt|swift|go|golang
                                      Generate application types for --table.
  --type-name:"name"                 Override generated type name.
  --naming:preserve|camel|pascal|snake
                                      Select generated property naming.
  --nullable:native|optional          Select nullable handling. Optional is TypeScript only.
  --comments                         Include schema comments.
  --defaults-as-comments             Include default values in comments.
  --json-type:unknown|record|json-value
                                      Select TypeScript JSON mapping.
  --include-generated                Include generated columns.
  --include-hidden                   Include hidden columns.
  --output:"file"                    Write generated types to a file.
  --json                             Print generated type result as JSON.
  --force                            Overwrite --output file if it exists.
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
        throw new Error(`Unsupported export format: ${format}. Use csv, tsv, md, or json.`);
    }

    return normalized;
}

function parseCliArguments(argv) {
    const options = {
        help: false,
        version: false,
        info: false,
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
        rawQuery: null,
        storeName: null,
        showQuery: null,
        showNotes: null,
        exportTarget: null,
        exportFormat: 'csv',
        documents: false,
        documentName: null,
        documentExport: false,
        backups: false,
        backup: false,
        backupName: null,
        backupNotes: null,
        tableName: null,
        typesTarget: null,
        typeName: null,
        naming: null,
        nullableMode: null,
        includeComments: false,
        includeDefaultsAsComments: false,
        includeGeneratedColumns: undefined,
        includeHiddenColumns: false,
        jsonType: null,
        outputPath: null,
        jsonOutput: false,
        force: false,
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

        if (flag === '--info' || flag === '--config') {
            options.info = true;
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
            options.rawQuery = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--store') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.storeName = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--saved-query') {
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

        if (flag === '--backups') {
            options.backups = true;
            continue;
        }

        if (flag === '--backup') {
            const parsed = takeOptionalFlagValue(value, argv, index);

            options.backup = true;
            if (parsed.hasValue) {
                options.backupName = parsed.value;
            }

            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--backup-name') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.backup = true;
            options.backupName = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--backup-notes') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.backup = true;
            options.backupNotes = parsed.value;
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

        if (flag === '--types') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.typesTarget = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--type-name') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.typeName = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--naming') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.naming = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--nullable') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.nullableMode = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--comments') {
            options.includeComments = true;
            continue;
        }

        if (flag === '--defaults-as-comments') {
            options.includeDefaultsAsComments = true;
            continue;
        }

        if (flag === '--include-generated') {
            options.includeGeneratedColumns = true;
            continue;
        }

        if (flag === '--include-hidden') {
            options.includeHiddenColumns = true;
            continue;
        }

        if (flag === '--json-type') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.jsonType = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--output') {
            const parsed = takeFlagValue(flag, value, argv, index);
            options.outputPath = parsed.value;
            index = parsed.nextIndex;
            continue;
        }

        if (flag === '--json') {
            options.jsonOutput = true;
            continue;
        }

        if (flag === '--force') {
            options.force = true;
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
        options.rawQuery ||
        options.storeName ||
        options.showQuery ||
        options.showNotes ||
        options.documents ||
        options.documentName ||
        options.documentExport ||
        options.backups ||
        options.backup ||
        options.exportTarget ||
        options.tableName ||
        options.typesTarget,
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
    const { query: matchingQuery, result } = databaseService.executeSavedQuery(conn.id, queryName, {
        executedBy: "cli",
    });

    console.log(`\nExecuting: ${getQueryTitle(matchingQuery)}`);
    console.log(`SQL: ${matchingQuery.previewSql || matchingQuery.rawSql}`);
    console.log('─'.repeat(60));

    printExecutionResult(result);
}

function executeRawQuery({ databaseService, conn, sql, storeName = null }) {
    const { result, storedQuery } = databaseService.executeRawQuery(conn.id, sql, {
        storeName,
        executedBy: "cli",
    });

    console.log(`\nExecuting raw SQL against: ${conn.label}`);
    console.log('─'.repeat(60));
    printExecutionResult(result);

    if (result.historyId) {
        console.log(`\nHistory ID: ${result.historyId}`);
    }

    if (storedQuery) {
        console.log(`Stored query: ${getQueryTitle(storedQuery)}`);
    }
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

function buildTypeOptions(options) {
    const typeOptions = {};

    if (options.typeName) typeOptions.typeName = options.typeName;
    if (options.naming) typeOptions.propertyNaming = options.naming;
    if (options.nullableMode) typeOptions.nullableMode = options.nullableMode;
    if (options.includeComments) typeOptions.includeComments = true;
    if (options.includeDefaultsAsComments) typeOptions.includeDefaultsAsComments = true;
    if (options.includeGeneratedColumns !== undefined) {
        typeOptions.includeGeneratedColumns = options.includeGeneratedColumns;
    }
    if (options.includeHiddenColumns) typeOptions.includeHiddenColumns = true;
    if (options.jsonType) typeOptions.jsonType = options.jsonType;

    return typeOptions;
}

function generateTypes({ databaseService, conn, tableName, options }) {
    if (!tableName) {
        throw new Error('--types requires --database and --table.');
    }

    if (options.jsonOutput && options.outputPath) {
        throw new Error('--json cannot be combined with --output.');
    }

    const result = databaseService.generateTableTypes(
        conn.id,
        tableName,
        options.typesTarget,
        buildTypeOptions(options)
    );

    if (options.jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    if (options.outputPath) {
        const outputPath = path.resolve(process.cwd(), options.outputPath);
        const expectedExtension = FILE_EXTENSIONS[result.target];

        if (path.extname(outputPath) !== expectedExtension) {
            throw new Error(`Output file for ${result.target} must use ${expectedExtension}.`);
        }

        if (!options.force && fs.existsSync(outputPath)) {
            throw new Error(`Output file already exists: ${outputPath}`);
        }

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, result.code, 'utf8');
        result.warnings.forEach(warning => console.error(`Warning: ${warning}`));
        console.error(`Generated ${result.target} types: ${outputPath}`);
        return;
    }

    result.warnings.forEach(warning => console.error(`Warning: ${warning}`));
    process.stdout.write(`${result.code}\n`);
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

function listManagedBackups({ databaseService, conn, options }) {
    const backups = databaseService.listBackups(conn.id);

    if (options.jsonOutput) {
        console.log(JSON.stringify({ items: backups, total: backups.length }, null, 2));
        return;
    }

    if (backups.length === 0) {
        console.log(`No backups found for ${conn.label}.`);
        return;
    }

    console.log(`\nBackups for ${conn.label} (${backups.length}):`);
    console.log('─'.repeat(60));

    backups.forEach((backup, index) => {
        const fileState = backup.fileExists ? 'available' : 'missing';
        console.log(`${index + 1}. ${backup.name}`);
        console.log(`   ID: ${backup.id}`);
        console.log(`   Status: ${backup.status} (${fileState})`);
        console.log(`   Size: ${formatSize(backup.sizeBytes)}`);
        console.log(`   Created: ${backup.createdAt}`);
        console.log(`   File: ${backup.path}`);
        if (backup.notes) {
            console.log(`   Notes: ${backup.notes}`);
        }
        console.log('');
    });
}

async function createManagedBackup({ databaseService, conn, options }) {
    const backup = await databaseService.createBackup(conn.id, {
        name: options.backupName,
        notes: options.backupNotes,
        context: 'cli',
    });

    if (options.jsonOutput) {
        console.log(JSON.stringify(backup, null, 2));
        return;
    }

    console.log(`Backup created: ${backup.name}`);
    console.log(`Status: ${backup.status}`);
    console.log(`Database: ${conn.label}`);
    console.log(`Size: ${formatSize(backup.sizeBytes)}`);
    console.log(`File: ${backup.path}`);
    console.log(`ID: ${backup.id}`);
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
            const columns =
                index.columns
                    .map(column => column.name)
                    .filter(Boolean)
                    .join(', ') || 'expression';
            console.log(`  - ${index.name}${unique}: ${columns}`);
        });
    }
}

function formatVersionStatus(versionCheck) {
    if (!versionCheck || versionCheck.status === 'unknown') {
        return `unknown${versionCheck?.error?.message ? ` (${versionCheck.error.message})` : ''}`;
    }

    if (versionCheck.updateAvailable) {
        return `update available (${versionCheck.currentVersion} -> ${versionCheck.latestVersion})`;
    }

    if (versionCheck.status === 'ahead') {
        return `ahead of npm latest (${versionCheck.currentVersion} > ${versionCheck.latestVersion})`;
    }

    return `current (${versionCheck.currentVersion})`;
}

async function printInfo(port, options = {}) {
    const infoService = options.appInfoService ?? buildAppInfo;
    const url = `http://127.0.0.1:${port}`;
    const info = await infoService({ port, url });

    console.log('SQLite Hub info');
    console.log(`Port: ${info.port}`);
    console.log(`URL: ${info.url}`);
    console.log(`Package: ${info.packageName}`);
    console.log(`App version: ${info.appVersion}`);
    console.log(`SQLite version: ${info.sqliteVersion}`);
    console.log(`Version status: ${formatVersionStatus(info.versionCheck)}`);

    if (info.versionCheck?.latestVersion) {
        console.log(`Latest version: ${info.versionCheck.latestVersion}`);
    }

    if (info.versionCheck?.releaseUrl) {
        console.log(`Release URL: ${info.versionCheck.releaseUrl}`);
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
        throw new Error('this command requires --database:"name".');
    }

    return options.databaseName;
}

function readCliFlags(argv = []) {
    return argv
        .filter(argument => String(argument ?? '').startsWith('-'))
        .map(argument => splitArgument(argument).flag)
        .filter(Boolean);
}

function describeCliAccess(options, argv = []) {
    const metadata = {
        flags: readCliFlags(argv),
    };
    const entry = {
        source: 'cli',
        action: 'cli.open',
        targetType: 'app',
        targetName: 'server',
        metadata,
    };

    if (!options) {
        return {
            ...entry,
            action: 'cli.parse',
            targetType: 'command',
            targetName: 'arguments',
        };
    }

    if (options.exportFormat) metadata.exportFormat = options.exportFormat;
    if (options.typesTarget) metadata.typesTarget = options.typesTarget;
    if (options.outputPath) metadata.hasOutputPath = true;
    if (options.jsonOutput) metadata.jsonOutput = true;
    if (options.force) metadata.force = true;

    if (options.help) {
        return {
            ...entry,
            action: 'cli.help',
            targetType: 'app',
            targetName: 'help',
        };
    }

    if (options.version) {
        return {
            ...entry,
            action: 'cli.version',
            targetType: 'app',
            targetName: 'version',
        };
    }

    if (options.info) {
        return {
            ...entry,
            action: 'cli.info',
            targetType: 'app',
            targetName: 'info',
        };
    }

    if (options.open) {
        return entry;
    }

    if (options.documents) {
        if (options.documentExport) {
            return {
                ...entry,
                action: 'cli.document.export',
                targetType: 'document',
                targetName: options.documentName || 'document',
            };
        }

        if (options.documentName) {
            return {
                ...entry,
                action: 'cli.document.get',
                targetType: 'document',
                targetName: options.documentName,
            };
        }

        return {
            ...entry,
            action: 'cli.documents.list',
            targetType: 'database',
            targetName: options.databaseName,
        };
    }

    if (options.backups) {
        return {
            ...entry,
            action: 'cli.backups.list',
            targetType: 'database',
            targetName: options.databaseName,
        };
    }

    if (options.backup) {
        return {
            ...entry,
            action: 'cli.backup.create',
            targetType: 'database',
            targetName: options.databaseName,
            metadata: {
                ...metadata,
                hasBackupName: Boolean(options.backupName),
                hasBackupNotes: Boolean(options.backupNotes),
            },
        };
    }

    if (options.tableName) {
        if (options.typesTarget) {
            return {
                ...entry,
                action: 'cli.table.types.generate',
                targetType: 'table',
                targetName: options.tableName,
            };
        }

        if (options.exportTarget) {
            return {
                ...entry,
                action: 'cli.table.row.export',
                targetType: 'table',
                targetName: options.tableName,
            };
        }

        return {
            ...entry,
            action: 'cli.table.get',
            targetType: 'table',
            targetName: options.tableName,
        };
    }

    if (options.exportTarget) {
        return {
            ...entry,
            action: 'cli.query.export',
            targetType: 'query',
            targetName: options.exportTarget,
        };
    }

    if (options.executeQuery) {
        return {
            ...entry,
            action: 'cli.query.execute.saved',
            targetType: 'query',
            targetName: options.executeQuery,
        };
    }

    if (options.rawQuery) {
        return {
            ...entry,
            action: 'cli.query.execute',
            targetType: 'query',
            targetName: options.storeName || 'raw query',
            metadata: {
                ...metadata,
                hasStoreName: Boolean(options.storeName),
            },
        };
    }

    if (options.showQuery) {
        return {
            ...entry,
            action: 'cli.query.get',
            targetType: 'query',
            targetName: options.showQuery,
        };
    }

    if (options.showNotes) {
        return {
            ...entry,
            action: 'cli.query.notes.get',
            targetType: 'query',
            targetName: options.showNotes,
        };
    }

    if (options.queries) {
        return {
            ...entry,
            action: 'cli.queries.list',
            targetType: 'database',
            targetName: options.databaseName,
        };
    }

    if (options.tables) {
        return {
            ...entry,
            action: 'cli.tables.list',
            targetType: 'database',
            targetName: options.databaseName,
        };
    }

    if (options.pathInfo) {
        return {
            ...entry,
            action: 'cli.database.path',
            targetType: 'database',
            targetName: options.databaseName,
        };
    }

    if (options.sizeInfo) {
        return {
            ...entry,
            action: 'cli.database.size',
            targetType: 'database',
            targetName: options.databaseName,
        };
    }

    if (options.lastOpenedInfo) {
        return {
            ...entry,
            action: 'cli.database.lastopened',
            targetType: 'database',
            targetName: options.databaseName,
        };
    }

    if (options.databaseList && !options.databaseName) {
        return {
            ...entry,
            action: 'cli.databases.list',
            targetType: 'app',
            targetName: 'databases',
        };
    }

    if (options.databaseName) {
        return {
            ...entry,
            action: 'cli.database.get',
            targetType: 'database',
            targetName: options.databaseName,
        };
    }

    return entry;
}

function recordCliAccess({ appStateStore, entry, startedAtMs, error }) {
    if (!appStateStore?.recordAccessLog || !entry) {
        return;
    }

    try {
        appStateStore.recordAccessLog({
            ...entry,
            status: error ? 'error' : 'success',
            startedAt: new Date(startedAtMs).toISOString(),
            durationMs: Date.now() - startedAtMs,
            errorMessage: error ? error.message : null,
        });
    } catch {
        // Access logging must not change CLI behavior or command output.
    }
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
    const startedAtMs = Date.now();
    let options = null;
    let accessEntry = describeCliAccess(null, argv);
    let accessLogStore = dependencies.appStateStore ?? null;
    let databaseService = dependencies.databaseService ?? null;
    let commandError = null;

    function getAccessLogStore() {
        if (dependencies.disableAccessLog) {
            return null;
        }

        if (accessLogStore) {
            return accessLogStore;
        }

        if (databaseService?.appStateStore) {
            accessLogStore = databaseService.appStateStore;
            return accessLogStore;
        }

        if (!dependencies.databaseService) {
            accessLogStore = createAppStateStore();
            return accessLogStore;
        }

        return null;
    }

    try {
        options = parseCliArguments(argv);
        accessEntry = describeCliAccess(options, argv);
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

        if (options.info) {
            await printInfo(port, dependencies);
            return;
        }

        if (options.open) {
            await startAndOpen(port);
            return;
        }

        if (options.storeName && !options.rawQuery) {
            throw new Error('--store requires --query:"sql".');
        }

        if (options.backup && options.backups) {
            throw new Error('--backup and --backups cannot be combined.');
        }

        databaseService =
            databaseService ??
            new DatabaseCommandService({
                appStateStore: getAccessLogStore(),
            });
        const connections = databaseService.listDatabases();

        if (options.databaseList && !options.databaseName && !hasDatabaseOperation(options)) {
            printDatabaseList(connections);
            return;
        }

        if (options.databaseName || hasDatabaseOperation(options)) {
            const dbName = requireDatabaseName(options);
            const conn = databaseService.getDatabase(dbName);
            accessEntry.databaseKey = conn.id;
            accessEntry.metadata = {
                ...(accessEntry.metadata ?? {}),
                databaseLabel: conn.label ?? null,
            };

            if (options.backups) {
                listManagedBackups({ databaseService, conn, options });
                return;
            }

            if (options.backup) {
                await createManagedBackup({ databaseService, conn, options });
                return;
            }

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

            if (
                options.tableName ||
                options.tables ||
                options.queries ||
                options.executeQuery ||
                options.rawQuery ||
                options.showQuery ||
                options.showNotes ||
                options.exportTarget ||
                options.typesTarget
            ) {
                if (options.tableName) {
                    if (options.typesTarget) {
                        generateTypes({
                            databaseService,
                            conn,
                            tableName: options.tableName,
                            options,
                        });
                        return;
                    }

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

                if (options.rawQuery) {
                    executeRawQuery({
                        databaseService,
                        conn,
                        sql: options.rawQuery,
                        storeName: options.storeName,
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
    } catch (error) {
        commandError = error;
        throw error;
    } finally {
        recordCliAccess({
            appStateStore: getAccessLogStore(),
            entry: accessEntry,
            startedAtMs,
            error: commandError,
        });
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    main,
    formatVersionStatus,
    normalizeExportFormat,
    openInDefaultBrowser,
    parseCliArguments,
    printInfo,
};
