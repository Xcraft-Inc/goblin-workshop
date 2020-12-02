const Goblin = require('xcraft-core-goblin');

/**
 * Retrieve the list of available commands.
 *
 * @returns {Object} The list and definitions of commands.
 */
exports.xcraftCommands = function () {
  return Goblin.buildQueue('graph-loader-queue', {
    sub: '*::*.<load-graph-requested>',
    queueSize: 10,
  });
};
