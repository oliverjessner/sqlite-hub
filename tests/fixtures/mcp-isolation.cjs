// Keep spawned MCP tests away from the user's registry and reject any network listener.
const os = require('node:os');
os.homedir = () => process.env.SQLITE_HUB_TEST_STATE_ROOT;
require('node:net').Server.prototype.listen = function () {
  throw new Error('MCP must not open a network listener');
};
if (process.env.SQLITE_HUB_TEST_DIAGNOSTICS) {
  setImmediate(() => {
    console.log('MCP test log');
    console.info('MCP test info');
    console.debug('MCP test debug');
    console.warn('MCP test warning');
  });
}
