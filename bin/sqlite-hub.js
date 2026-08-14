#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseCommandService, getQueryTitle } = require('../server/services/databaseCommandService');
const { buildAppInfo } = require('../server/services/appInfoService');
const { FILE_EXTENSIONS } = require('../server/services/typeGenerationService');

const DEFAULT_PORT = 4173;
const EXPORT_FORMATS = new Set(['csv', 'tsv', 'md', 'json']);
const TYPE_LANGUAGES = new Set([
    'typescript',
    'ts',
    'rust',
    'rs',
    'kotlin',
    'kt',
    'swift',
    'go',
    'golang',
]);

const TOP_LEVEL_HELP = `SQLite Hub CLI

Usage:
  sqlite-hub [command]

Commands:
  serve       Start SQLite Hub
  info        Show SQLite Hub information
  db          Work with databases
  table       Inspect database tables
  row         Work with individual rows
  query       Run and manage SQL queries
  doc         Work with Markdown documents
  backup      Manage database backups
  types       Generate application types

Global Options:
  -h, --help
  -v, --version`;

const RESOURCE_HELP = {
    serve: `Usage:
  sqlite-hub serve [options]

Start the SQLite Hub server.

Options:
  --port PORT   Listen on a custom port (default: 4173)
  --open        Open SQLite Hub in the default browser
  -h, --help    Show this help`,
    info: `Usage:
  sqlite-hub info [options]

Show SQLite Hub, SQLite runtime, URL, and version status.

Options:
  --port PORT   Use a custom port when reporting the local URL
  -h, --help    Show this help`,
    db: `Usage:
  sqlite-hub db <action> [arguments] [options]

Actions:
  list          List imported databases
  info          Show one database

Run "sqlite-hub db <action> --help" for action details.`,
    table: `Usage:
  sqlite-hub table <action> [arguments] [options]

Actions:
  list          List tables
  info          Inspect table metadata

Run "sqlite-hub table <action> --help" for action details.`,
    row: `Usage:
  sqlite-hub row <action> [arguments] [options]

Actions:
  get           Get one row by primary key or rowid

Run "sqlite-hub row get --help" for action details.`,
    query: `Usage:
  sqlite-hub query <action> [arguments] [options]

Actions:
  list          List saved queries
  show          Show a saved query
  run           Run raw SQL
  exec          Execute a saved query
  save          Save SQL without executing it
  export        Export a saved query

Run "sqlite-hub query <action> --help" for action details.`,
    doc: `Usage:
  sqlite-hub doc <action> [arguments] [options]

Actions:
  list          List Markdown documents
  show          Show a Markdown document
  export        Export a Markdown document

Run "sqlite-hub doc <action> --help" for action details.`,
    backup: `Usage:
  sqlite-hub backup <action> [arguments] [options]

Actions:
  list          List managed backups
  create        Create and verify a backup

Run "sqlite-hub backup <action> --help" for action details.`,
    types: `Usage:
  sqlite-hub types <action> [arguments] [options]

Actions:
  generate      Generate application types from a table

Run "sqlite-hub types generate --help" for action details.`,
};

const ACTION_HELP = {
    'db list': `Usage:
  sqlite-hub db list [--json]

List all imported SQLite Hub databases.`,
    'db info': `Usage:
  sqlite-hub db info <database> [--json]

Show database name, id, path, size, last-opened timestamp, and read-only status.`,
    'table list': `Usage:
  sqlite-hub table list --db <database> [--json]

List tables in a database.`,
    'table info': `Usage:
  sqlite-hub table info <table> --db <database> [--json]

Show columns, keys, indexes, row count, and row identity metadata.`,
    'row get': `Usage:
  sqlite-hub row get <table> <key> --db <database>

Get one row by primary key or rowid. Output is JSON.`,
    'query list': `Usage:
  sqlite-hub query list --db <database> [--json]

List saved SQL Editor queries.`,
    'query show': `Usage:
  sqlite-hub query show <query> --db <database> [--json]

Show SQL and metadata for a saved query.`,
    'query run': `Usage:
  sqlite-hub query run <sql> --db <database> [--save <name>] [--json]

Run raw SQL through the SQL Editor execution path and record Query History.`,
    'query exec': `Usage:
  sqlite-hub query exec <query> --db <database> [--json]

Execute an existing saved query.`,
    'query save': `Usage:
  sqlite-hub query save <sql> --db <database> --name <name> [--notes <text>] [--json]

Create or update a saved query without executing it.`,
    'query export': `Usage:
  sqlite-hub query export <query> --db <database> [--format <format>] [--output <file>]

Export a saved query as csv, tsv, md, or json.`,
    'doc list': `Usage:
  sqlite-hub doc list --db <database> [--json]

List Markdown documents.`,
    'doc show': `Usage:
  sqlite-hub doc show <document> --db <database> [--json]

Show a Markdown document.`,
    'doc export': `Usage:
  sqlite-hub doc export <document> --db <database> [--output <file>]

Export a Markdown document to a file.`,
    'backup list': `Usage:
  sqlite-hub backup list --db <database> [--json]

List managed backups.`,
    'backup create': `Usage:
  sqlite-hub backup create --db <database> [--name <name>] [--notes <text>] [--json]

Create and verify a managed backup.`,
    'types generate': `Usage:
  sqlite-hub types generate <table> --db <database> --lang <language> [options]

Languages:
  typescript, ts, rust, rs, kotlin, kt, swift, go, golang

Options:
  --name NAME
  --naming preserve|camel|pascal|snake
  --nullable native|optional
  --comments
  --defaults-as-comments
  --json-type unknown|record|json-value
  --include-generated
  --include-hidden
  --output FILE
  --force
  --json`,
};

const COMMAND_SPECS = {
    serve: {
        positionalCount: 0,
        options: ['port', 'open'],
        defaults: { port: DEFAULT_PORT, open: false },
    },
    info: {
        positionalCount: 0,
        options: ['port'],
        defaults: { port: DEFAULT_PORT },
    },
    'db list': {
        positionalCount: 0,
        options: ['json'],
    },
    'db info': {
        positionalCount: 1,
        options: ['json'],
    },
    'table list': {
        positionalCount: 0,
        options: ['db', 'json'],
        requiredOptions: ['db'],
    },
    'table info': {
        positionalCount: 1,
        options: ['db', 'json'],
        requiredOptions: ['db'],
    },
    'row get': {
        positionalCount: 2,
        options: ['db'],
        requiredOptions: ['db'],
    },
    'query list': {
        positionalCount: 0,
        options: ['db', 'json'],
        requiredOptions: ['db'],
    },
    'query show': {
        positionalCount: 1,
        options: ['db', 'json'],
        requiredOptions: ['db'],
    },
    'query run': {
        positionalCount: 1,
        options: ['db', 'save', 'json'],
        requiredOptions: ['db'],
    },
    'query exec': {
        positionalCount: 1,
        options: ['db', 'json'],
        requiredOptions: ['db'],
    },
    'query save': {
        positionalCount: 1,
        options: ['db', 'name', 'notes', 'json'],
        requiredOptions: ['db', 'name'],
    },
    'query export': {
        positionalCount: 1,
        options: ['db', 'format', 'output'],
        requiredOptions: ['db'],
        defaults: { format: 'csv' },
    },
    'doc list': {
        positionalCount: 0,
        options: ['db', 'json'],
        requiredOptions: ['db'],
    },
    'doc show': {
        positionalCount: 1,
        options: ['db', 'json'],
        requiredOptions: ['db'],
    },
    'doc export': {
        positionalCount: 1,
        options: ['db', 'output'],
        requiredOptions: ['db'],
    },
    'backup list': {
        positionalCount: 0,
        options: ['db', 'json'],
        requiredOptions: ['db'],
    },
    'backup create': {
        positionalCount: 0,
        options: ['db', 'name', 'notes', 'json'],
        requiredOptions: ['db'],
    },
    'types generate': {
        positionalCount: 1,
        options: [
            'db',
            'lang',
            'name',
            'naming',
            'nullable',
            'comments',
            'defaultsAsComments',
            'jsonType',
            'includeGenerated',
            'includeHidden',
            'output',
            'force',
            'json',
        ],
        requiredOptions: ['db', 'lang'],
    },
};

const OPTION_DEFINITIONS = {
    '--port': { key: 'port', takesValue: true, parse: parsePort },
    '--open': { key: 'open', takesValue: false },
    '--db': { key: 'db', takesValue: true },
    '--json': { key: 'json', takesValue: false },
    '--save': { key: 'save', takesValue: true },
    '--name': { key: 'name', takesValue: true },
    '--notes': { key: 'notes', takesValue: true },
    '--format': { key: 'format', takesValue: true, parse: normalizeExportFormat },
    '--output': { key: 'output', takesValue: true },
    '--lang': { key: 'lang', takesValue: true, parse: normalizeTypeLanguage },
    '--naming': { key: 'naming', takesValue: true },
    '--nullable': { key: 'nullable', takesValue: true },
    '--comments': { key: 'comments', takesValue: false },
    '--defaults-as-comments': { key: 'defaultsAsComments', takesValue: false },
    '--json-type': { key: 'jsonType', takesValue: true },
    '--include-generated': { key: 'includeGenerated', takesValue: false },
    '--include-hidden': { key: 'includeHidden', takesValue: false },
    '--force': { key: 'force', takesValue: false },
};

const RESOURCE_ACTIONS = {
    db: new Set(['list', 'info']),
    table: new Set(['list', 'info']),
    row: new Set(['get']),
    query: new Set(['list', 'show', 'run', 'exec', 'save', 'export']),
    doc: new Set(['list', 'show', 'export']),
    backup: new Set(['list', 'create']),
    types: new Set(['generate']),
};

function parsePort(rawValue) {
    const port = Number(rawValue);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${rawValue}`);
    }

    return port;
}

function normalizeExportFormat(format) {
    const normalized = String(format ?? 'csv').toLowerCase();

    if (!EXPORT_FORMATS.has(normalized)) {
        throw new Error(`Unsupported export format: ${format}. Use csv, tsv, md, or json.`);
    }

    return normalized;
}

function normalizeTypeLanguage(language) {
    const normalized = String(language ?? '').trim().toLowerCase();

    if (!TYPE_LANGUAGES.has(normalized)) {
        throw new Error(`Unsupported language: ${language}.`);
    }

    return normalized;
}

function getHelpText(pathParts = []) {
    const key = pathParts.join(' ');

    if (!key) {
        return TOP_LEVEL_HELP;
    }

    return ACTION_HELP[key] ?? RESOURCE_HELP[key] ?? TOP_LEVEL_HELP;
}

function getUsage(commandKey) {
    const help = getHelpText(commandKey ? commandKey.split(' ') : []);
    const lines = help.split('\n');
    const usageIndex = lines.indexOf('Usage:');
    return lines.slice(usageIndex, usageIndex + 2).join('\n');
}

function syntaxError(message, commandKey = '') {
    return new Error(`${message}\n${getUsage(commandKey)}`);
}

function parseOptionToken(token) {
    const equalsIndex = token.indexOf('=');

    if (equalsIndex < 0) {
        return { name: token, inlineValue: undefined };
    }

    return {
        name: token.slice(0, equalsIndex),
        inlineValue: token.slice(equalsIndex + 1),
    };
}

function parseCommandArguments(tokens, spec, commandKey) {
    const options = { ...(spec.defaults ?? {}) };
    const positionals = [];
    let optionsEnded = false;

    for (let index = 0; index < tokens.length; index += 1) {
        const token = String(tokens[index]);

        if (!optionsEnded && token === '--') {
            optionsEnded = true;
            continue;
        }

        if (!optionsEnded && token.startsWith('-')) {
            const { name, inlineValue } = parseOptionToken(token);
            const definition = OPTION_DEFINITIONS[name];

            if (!definition || !spec.options.includes(definition.key)) {
                throw syntaxError(`Unknown option for ${commandKey}: ${name}`, commandKey);
            }

            if (!definition.takesValue) {
                if (inlineValue !== undefined) {
                    throw syntaxError(`${name} does not accept a value.`, commandKey);
                }

                options[definition.key] = true;
                continue;
            }

            let value = inlineValue;

            if (value === undefined) {
                value = tokens[index + 1];

                if (value === undefined || String(value).startsWith('--')) {
                    throw syntaxError(`${name} requires a value.`, commandKey);
                }

                index += 1;
            }

            if (String(value).trim() === '') {
                throw syntaxError(`${name} requires a non-empty value.`, commandKey);
            }

            try {
                options[definition.key] = definition.parse
                    ? definition.parse(value)
                    : String(value);
            } catch (error) {
                throw syntaxError(error.message, commandKey);
            }
            continue;
        }

        positionals.push(token);
    }

    if (positionals.length !== spec.positionalCount) {
        const message = positionals.length < spec.positionalCount
            ? `Missing argument for ${commandKey}.`
            : `Too many arguments for ${commandKey}.`;
        throw syntaxError(message, commandKey);
    }

    for (const requiredOption of spec.requiredOptions ?? []) {
        if (options[requiredOption] === undefined) {
            const optionName = Object.entries(OPTION_DEFINITIONS)
                .find(([, definition]) => definition.key === requiredOption)?.[0] ?? `--${requiredOption}`;
            throw syntaxError(`${commandKey} requires ${optionName}.`, commandKey);
        }
    }

    if (commandKey === 'types generate' && options.json && options.output) {
        throw syntaxError('--json cannot be combined with --output.', commandKey);
    }

    return { positionals, options };
}

function parseCliArguments(argv = []) {
    const tokens = Array.from(argv, argument => String(argument));

    if (tokens.length === 0) {
        return {
            resource: 'serve',
            action: null,
            arguments: [],
            options: { ...COMMAND_SPECS.serve.defaults },
            implicit: true,
        };
    }

    if (tokens.length === 1 && ['--help', '-h'].includes(tokens[0])) {
        return { help: true, helpPath: [] };
    }

    if (tokens.length === 1 && ['--version', '-v'].includes(tokens[0])) {
        return { version: true };
    }

    const resource = tokens[0];

    if (!RESOURCE_HELP[resource]) {
        throw syntaxError(`Unknown command: ${resource}`);
    }

    if (['serve', 'info'].includes(resource)) {
        if (tokens.slice(1).some(token => ['--help', '-h'].includes(token))) {
            return { help: true, helpPath: [resource] };
        }

        const { positionals, options } = parseCommandArguments(
            tokens.slice(1),
            COMMAND_SPECS[resource],
            resource
        );
        return { resource, action: null, arguments: positionals, options };
    }

    const action = tokens[1];

    if (!action || ['--help', '-h'].includes(action)) {
        if (action) {
            return { help: true, helpPath: [resource] };
        }

        throw syntaxError(`Missing action for ${resource}.`, resource);
    }

    if (!RESOURCE_ACTIONS[resource]?.has(action)) {
        throw syntaxError(`Unknown ${resource} action: ${action}`, resource);
    }

    const commandKey = `${resource} ${action}`;

    if (tokens.slice(2).some(token => ['--help', '-h'].includes(token))) {
        return { help: true, helpPath: [resource, action] };
    }

    const { positionals, options } = parseCommandArguments(
        tokens.slice(2),
        COMMAND_SPECS[commandKey],
        commandKey
    );

    return {
        resource,
        action,
        arguments: positionals,
        options,
    };
}

function printHelp(pathParts = []) {
    console.log(getHelpText(pathParts));
}

function openInDefaultBrowser(url) {
    const openers = {
        darwin: { command: 'open', args: [url] },
        win32: {
            command: 'cmd',
            args: ['/c', 'start', '', url],
            options: { windowsHide: true },
        },
        default: { command: 'xdg-open', args: [url] },
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

function writeJson(value) {
    console.log(JSON.stringify(value, null, 2));
}

function createAppStateStore() {
    const { resolveAppStatePaths } = require('../server/utils/appPaths');
    const { AppStateStore } = require('../server/services/storage/appStateStore');
    const packageRoot = path.resolve(__dirname, '..');
    const { appStateDbPath } = resolveAppStatePaths(packageRoot);

    return new AppStateStore(appStateDbPath);
}

function printDatabaseList(connections, jsonOutput = false) {
    if (jsonOutput) {
        writeJson({ items: connections, total: connections.length });
        return;
    }

    if (connections.length === 0) {
        console.log('No databases imported yet.');
        return;
    }

    console.log(`\nImported databases (${connections.length}):`);
    console.log('─'.repeat(60));
    connections.forEach((conn, index) => {
        const readOnly = conn.readOnly ? ' (read-only)' : '';
        console.log(`${index + 1}. ${conn.label}${readOnly}`);
        console.log(`   ID: ${conn.id}`);
        console.log(`   Path: ${conn.path}`);
        console.log(`   Size: ${formatSize(conn.sizeBytes)}`);
        console.log(`   Last opened: ${conn.lastOpenedAt}`);
        console.log('');
    });
}

function printSingleDatabaseInfo(conn, jsonOutput = false) {
    if (jsonOutput) {
        writeJson(conn);
        return;
    }

    console.log(`Name: ${conn.label}`);
    console.log(`ID: ${conn.id}`);
    console.log(`Path: ${conn.path}`);
    console.log(`Size: ${formatSize(conn.sizeBytes)}`);
    console.log(`Last opened: ${conn.lastOpenedAt}`);
    console.log(`Read-only: ${conn.readOnly ? 'yes' : 'no'}`);
}

function printTables(conn, tables, jsonOutput = false) {
    if (jsonOutput) {
        writeJson({ database: { id: conn.id, label: conn.label }, items: tables, total: tables.length });
        return;
    }

    if (tables.length === 0) {
        console.log('No tables found in this database.');
        return;
    }

    console.log(`\nTables in ${conn.label} (${tables.length}):`);
    console.log('─'.repeat(60));
    tables.forEach((table, index) => console.log(`${index + 1}. ${table.name ?? table}`));
    console.log('');
}

function listSavedQueries(databaseService, conn, jsonOutput = false) {
    const savedQueries = databaseService.listSavedQueries(conn.id);

    if (jsonOutput) {
        writeJson(savedQueries);
        return;
    }

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
    if (value === null) return 'NULL';
    if (value && typeof value === 'object') return JSON.stringify(value);
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
            if (statement.lastInsertRowid) console.log('Last insert rowid:', statement.lastInsertRowid);
        }
    });
}

function executeSavedQuery({ databaseService, conn, queryName, jsonOutput = false }) {
    const payload = databaseService.executeSavedQuery(conn.id, queryName, { executedBy: 'cli' });

    if (jsonOutput) {
        writeJson(payload);
        return;
    }

    console.log(`\nExecuting: ${getQueryTitle(payload.query)}`);
    console.log(`SQL: ${payload.query.previewSql || payload.query.rawSql}`);
    console.log('─'.repeat(60));
    printExecutionResult(payload.result);
}

function executeRawQuery({ databaseService, conn, sql, saveName = null, jsonOutput = false }) {
    const payload = databaseService.executeRawQuery(conn.id, sql, {
        storeName: saveName,
        executedBy: 'cli',
    });

    if (jsonOutput) {
        writeJson({ result: payload.result, storedQuery: payload.storedQuery });
        return;
    }

    console.log(`\nExecuting raw SQL against: ${conn.label}`);
    console.log('─'.repeat(60));
    printExecutionResult(payload.result);
    if (payload.result.historyId) console.log(`\nHistory ID: ${payload.result.historyId}`);
    if (payload.storedQuery) console.log(`Stored query: ${getQueryTitle(payload.storedQuery)}`);
}

function createStoredQuery({ databaseService, conn, sql, title, notes, jsonOutput = false }) {
    const result = databaseService.createStoredQuery(conn.id, { sql, title, notes });

    if (jsonOutput) {
        writeJson(result);
        return;
    }

    console.log(`${result.created ? 'Created' : 'Updated'} stored query: ${getQueryTitle(result.query)}`);
    console.log(`SQL: ${result.query.rawSql}`);
    if (result.query.notes) console.log(`Notes: ${result.query.notes}`);
}

function showSavedQuery({ databaseService, conn, queryName, jsonOutput = false }) {
    const query = databaseService.getSavedQuery(conn.id, queryName);

    if (jsonOutput) {
        writeJson(query);
        return;
    }

    console.log(`Query: ${getQueryTitle(query)}`);
    console.log(`ID: ${query.id}`);
    console.log(`Type: ${query.queryType ?? 'other'}`);
    console.log(`Last used: ${query.lastUsedAt ?? 'never'}`);
    if (query.notes) console.log(`Notes: ${query.notes}`);
    console.log('\nSQL:');
    console.log(query.rawSql);
}

function resolveOutputPath(requestedPath, fallbackFilename) {
    return path.resolve(process.cwd(), requestedPath || fallbackFilename);
}

function writeOutputFile(outputPath, content) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, 'utf8');
}

function exportSavedQuery({ databaseService, conn, queryName, format, output }) {
    const { query, result } = databaseService.exportSavedQuery(conn.id, queryName, format);
    const outputPath = resolveOutputPath(output, result.filename);
    writeOutputFile(outputPath, result.content);
    console.log(`Exported query: ${getQueryTitle(query)}`);
    console.log(`Format: ${result.format}`);
    console.log(`Rows: ${result.rowCount}`);
    console.log(`File: ${outputPath}`);
}

function buildTypeOptions(options) {
    const typeOptions = {};

    if (options.name) typeOptions.typeName = options.name;
    if (options.naming) typeOptions.propertyNaming = options.naming;
    if (options.nullable) typeOptions.nullableMode = options.nullable;
    if (options.comments) typeOptions.includeComments = true;
    if (options.defaultsAsComments) typeOptions.includeDefaultsAsComments = true;
    if (options.includeGenerated) typeOptions.includeGeneratedColumns = true;
    if (options.includeHidden) typeOptions.includeHiddenColumns = true;
    if (options.jsonType) typeOptions.jsonType = options.jsonType;

    return typeOptions;
}

function generateTypes({ databaseService, conn, tableName, options }) {
    const result = databaseService.generateTableTypes(
        conn.id,
        tableName,
        options.lang,
        buildTypeOptions(options)
    );

    if (options.json) {
        writeJson(result);
        return;
    }

    if (options.output) {
        const outputPath = resolveOutputPath(options.output, result.fileName);
        const expectedExtension = FILE_EXTENSIONS[result.target];

        if (path.extname(outputPath) !== expectedExtension) {
            throw new Error(`Output file for ${result.target} must use ${expectedExtension}.`);
        }

        if (!options.force && fs.existsSync(outputPath)) {
            throw new Error(`Output file already exists: ${outputPath}`);
        }

        writeOutputFile(outputPath, result.code);
        result.warnings.forEach(warning => console.error(`Warning: ${warning}`));
        console.error(`Generated ${result.target} types: ${outputPath}`);
        return;
    }

    result.warnings.forEach(warning => console.error(`Warning: ${warning}`));
    process.stdout.write(`${result.code}\n`);
}

function listDocuments(databaseService, conn, jsonOutput = false) {
    const documents = databaseService.listDocuments(conn.id);

    if (jsonOutput) {
        writeJson({ items: documents, total: documents.length });
        return;
    }

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

function showDocumentMarkdown({ databaseService, conn, documentName, jsonOutput = false }) {
    const document = databaseService.getDocument(conn.id, documentName);

    if (jsonOutput) {
        writeJson(document);
        return;
    }

    console.log(document.content ?? '');
}

function exportDocumentMarkdown({ databaseService, conn, documentName, output }) {
    const result = databaseService.exportDocument(conn.id, documentName);
    const outputPath = resolveOutputPath(output, result.filename);
    writeOutputFile(outputPath, result.content);
    console.log(`Exported document: ${result.document.filename}`);
    console.log(`Characters: ${result.document.contentLength}`);
    console.log(`File: ${outputPath}`);
}

function listManagedBackups({ databaseService, conn, jsonOutput = false }) {
    const backups = databaseService.listBackups(conn.id);

    if (jsonOutput) {
        writeJson({ items: backups, total: backups.length });
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
        if (backup.notes) console.log(`   Notes: ${backup.notes}`);
        console.log('');
    });
}

async function createManagedBackup({ databaseService, conn, options }) {
    const backup = await databaseService.createBackup(conn.id, {
        name: options.name,
        notes: options.notes,
        context: 'cli',
    });

    if (options.json) {
        writeJson(backup);
        return;
    }

    console.log(`Backup created: ${backup.name}`);
    console.log(`Status: ${backup.status}`);
    console.log(`Database: ${conn.label}`);
    console.log(`Size: ${formatSize(backup.sizeBytes)}`);
    console.log(`File: ${backup.path}`);
    console.log(`ID: ${backup.id}`);
}

function printRowAsJson({ databaseService, conn, tableName, key }) {
    const result = databaseService.getTableRow(conn.id, tableName, key);
    writeJson(result.data);
}

function formatColumnFlags(column, foreignKeyColumns) {
    const flags = [];
    if (column.primaryKeyPosition > 0) {
        flags.push(`PK${column.primaryKeyPosition > 1 ? `:${column.primaryKeyPosition}` : ''}`);
    }
    if (foreignKeyColumns.has(column.name)) flags.push('FK');
    if (column.notNull) flags.push('NOT NULL');
    if (column.generated) flags.push('GENERATED');
    return flags.length ? ` [${flags.join(', ')}]` : '';
}

function printTableInfo(tableDetail, jsonOutput = false) {
    if (jsonOutput) {
        writeJson(tableDetail);
        return;
    }

    const foreignKeyColumns = new Set(
        tableDetail.foreignKeys.flatMap(foreignKey => foreignKey.mappings.map(mapping => mapping.from))
    );
    console.log(`Table: ${tableDetail.name}`);
    console.log(`Rows: ${tableDetail.rowCount ?? 'N/A'}`);
    console.log(`Identity: ${tableDetail.identityStrategy.type}`);
    console.log(`Columns: ${tableDetail.columns.filter(column => column.visible).length}`);
    console.log('');
    tableDetail.columns.filter(column => column.visible).forEach(column => {
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
    if (info.versionCheck?.latestVersion) console.log(`Latest version: ${info.versionCheck.latestVersion}`);
    if (info.versionCheck?.releaseUrl) console.log(`Release URL: ${info.versionCheck.releaseUrl}`);
}

async function serveApp(port, options = {}) {
    const startServer = options.startServer ?? require('../server/server').startServer;
    const openBrowser = options.openBrowser ?? openInDefaultBrowser;
    const fallbackUrl = `http://127.0.0.1:${port}`;

    try {
        const { url = fallbackUrl } = await startServer({ port });
        if (options.open) openBrowser(url);
    } catch (error) {
        if (error.code !== 'EADDRINUSE') throw error;
        console.warn(`Server already appears to be running on ${fallbackUrl}`);
        if (options.open) openBrowser(fallbackUrl);
    }
}

function readCliOptions(argv = []) {
    return argv
        .filter(argument => String(argument).startsWith('--'))
        .map(argument => String(argument).split('=', 1)[0]);
}

function describeCliAccess(command, argv = []) {
    const metadata = { options: readCliOptions(argv) };
    const entry = {
        source: 'cli',
        action: 'cli.parse',
        targetType: 'command',
        targetName: 'arguments',
        metadata,
    };

    if (!command) return entry;
    if (command.help) return { ...entry, action: 'cli.help', targetType: 'command', targetName: command.helpPath.join(' ') || 'help' };
    if (command.version) return { ...entry, action: 'cli.version', targetType: 'app', targetName: 'version' };

    const key = [command.resource, command.action].filter(Boolean).join(' ');
    const firstArgument = command.arguments?.[0] ?? null;
    const mappings = {
        serve: ['cli.open', 'app', 'server'],
        info: ['cli.info', 'app', 'info'],
        'db list': ['cli.databases.list', 'app', 'databases'],
        'db info': ['cli.database.get', 'database', firstArgument],
        'table list': ['cli.tables.list', 'database', command.options.db],
        'table info': ['cli.table.get', 'table', firstArgument],
        'row get': ['cli.table.row.export', 'table', firstArgument],
        'query list': ['cli.queries.list', 'database', command.options.db],
        'query show': ['cli.query.get', 'query', firstArgument],
        'query run': ['cli.query.execute', 'query', command.options.save || 'raw query'],
        'query exec': ['cli.query.execute.saved', 'query', firstArgument],
        'query save': ['cli.query.create.stored', 'query', command.options.name],
        'query export': ['cli.query.export', 'query', firstArgument],
        'doc list': ['cli.documents.list', 'database', command.options.db],
        'doc show': ['cli.document.get', 'document', firstArgument],
        'doc export': ['cli.document.export', 'document', firstArgument],
        'backup list': ['cli.backups.list', 'database', command.options.db],
        'backup create': ['cli.backup.create', 'database', command.options.db],
        'types generate': ['cli.table.types.generate', 'table', firstArgument],
    };
    const [action, targetType, targetName] = mappings[key] ?? ['cli.parse', 'command', key];

    if (command.options?.format) metadata.exportFormat = command.options.format;
    if (command.options?.lang) metadata.typesTarget = command.options.lang;
    if (command.options?.output) metadata.hasOutputPath = true;
    if (command.options?.json) metadata.jsonOutput = true;
    if (command.options?.force) metadata.force = true;
    if (key === 'backup create') {
        metadata.hasBackupName = Boolean(command.options.name);
        metadata.hasBackupNotes = Boolean(command.options.notes);
    }
    if (key === 'query run') metadata.hasStoreName = Boolean(command.options.save);
    if (key === 'query save') metadata.hasNotes = Boolean(command.options.notes);

    return { ...entry, action, targetType, targetName };
}

function recordCliAccess({ appStateStore, entry, startedAtMs, error }) {
    if (!appStateStore?.recordAccessLog || !entry) return;

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
    let command = null;
    let accessEntry = describeCliAccess(null, argv);
    let accessLogStore = dependencies.appStateStore ?? null;
    let databaseService = dependencies.databaseService ?? null;
    let commandError = null;

    function getAccessLogStore() {
        if (dependencies.disableAccessLog) return null;
        if (accessLogStore) return accessLogStore;
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
        command = parseCliArguments(argv);
        accessEntry = describeCliAccess(command, argv);

        if (command.help) {
            printHelp(command.helpPath);
            return;
        }

        if (command.version) {
            const { version } = require('../package.json');
            console.log(`SQLite Hub CLI version ${version}`);
            return;
        }

        if (command.resource === 'serve') {
            await serveApp(command.options.port, {
                open: command.options.open,
                startServer: dependencies.startServer,
                openBrowser: dependencies.openBrowser,
            });
            return;
        }

        if (command.resource === 'info') {
            await printInfo(command.options.port, dependencies);
            return;
        }

        databaseService = databaseService ?? new DatabaseCommandService({
            appStateStore: getAccessLogStore(),
        });
        const key = `${command.resource} ${command.action}`;

        if (key === 'db list') {
            printDatabaseList(databaseService.listDatabases(), command.options.json);
            return;
        }

        const databaseReference = key === 'db info'
            ? command.arguments[0]
            : command.options.db;
        const conn = databaseService.getDatabase(databaseReference);
        accessEntry.databaseKey = conn.id;
        accessEntry.metadata = {
            ...(accessEntry.metadata ?? {}),
            databaseLabel: conn.label ?? null,
        };

        switch (key) {
            case 'db info':
                printSingleDatabaseInfo(conn, command.options.json);
                return;
            case 'table list':
                printTables(conn, databaseService.listTables(conn.id), command.options.json);
                return;
            case 'table info':
                printTableInfo(databaseService.getTable(conn.id, command.arguments[0]), command.options.json);
                return;
            case 'row get':
                printRowAsJson({
                    databaseService,
                    conn,
                    tableName: command.arguments[0],
                    key: command.arguments[1],
                });
                return;
            case 'query list':
                listSavedQueries(databaseService, conn, command.options.json);
                return;
            case 'query show':
                showSavedQuery({
                    databaseService,
                    conn,
                    queryName: command.arguments[0],
                    jsonOutput: command.options.json,
                });
                return;
            case 'query run':
                executeRawQuery({
                    databaseService,
                    conn,
                    sql: command.arguments[0],
                    saveName: command.options.save,
                    jsonOutput: command.options.json,
                });
                return;
            case 'query exec':
                executeSavedQuery({
                    databaseService,
                    conn,
                    queryName: command.arguments[0],
                    jsonOutput: command.options.json,
                });
                return;
            case 'query save':
                createStoredQuery({
                    databaseService,
                    conn,
                    sql: command.arguments[0],
                    title: command.options.name,
                    notes: command.options.notes,
                    jsonOutput: command.options.json,
                });
                return;
            case 'query export':
                exportSavedQuery({
                    databaseService,
                    conn,
                    queryName: command.arguments[0],
                    format: command.options.format,
                    output: command.options.output,
                });
                return;
            case 'doc list':
                listDocuments(databaseService, conn, command.options.json);
                return;
            case 'doc show':
                showDocumentMarkdown({
                    databaseService,
                    conn,
                    documentName: command.arguments[0],
                    jsonOutput: command.options.json,
                });
                return;
            case 'doc export':
                exportDocumentMarkdown({
                    databaseService,
                    conn,
                    documentName: command.arguments[0],
                    output: command.options.output,
                });
                return;
            case 'backup list':
                listManagedBackups({
                    databaseService,
                    conn,
                    jsonOutput: command.options.json,
                });
                return;
            case 'backup create':
                await createManagedBackup({ databaseService, conn, options: command.options });
                return;
            case 'types generate':
                generateTypes({
                    databaseService,
                    conn,
                    tableName: command.arguments[0],
                    options: command.options,
                });
                return;
            default:
                throw syntaxError(`Unsupported command: ${key}`, key);
        }
    } catch (error) {
        commandError = error;
        throw error;
    } finally {
        let finalAccessLogStore = null;

        try {
            finalAccessLogStore = getAccessLogStore();
        } catch {
            // Access logging is best effort, including store initialization.
        }

        recordCliAccess({
            appStateStore: finalAccessLogStore,
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
    formatVersionStatus,
    getHelpText,
    main,
    normalizeExportFormat,
    openInDefaultBrowser,
    parseCliArguments,
    printInfo,
};
