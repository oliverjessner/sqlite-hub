#!/usr/bin/env node

const { spawn } = require('node:child_process');

const DEFAULT_PORT = 4173;

function printHelp() {
    console.log(`SQLite Hub CLI

Usage:
  sqlite-hub [--port:4173]

Options:
  --help        Show this help text.
  --port:PORT   Start the server on a custom port.
  --version     Show the version number.
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

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (argument === '--help' || argument === '-h') {
            return { help: true };
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

async function main() {
    const { help, port = DEFAULT_PORT } = parseCliArguments(process.argv.slice(2));

    if (help) {
        printHelp();
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
