const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { AppStateStore } = require('../server/services/storage/appStateStore');

test('existing connection limit is migrated from 12 to 32', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-hub-connection-limit-'));
    const statePath = path.join(directory, 'state.db');
    let store = new AppStateStore(statePath);

    store.patchSettings({ maxRecentConnections: 12 });
    store.db.close();

    store = new AppStateStore(statePath);

    t.after(() => {
        store.db.close();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    assert.equal(store.getSettings().maxRecentConnections, 32);
});
