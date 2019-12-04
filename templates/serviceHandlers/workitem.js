module.exports = name => `'use strict';

/**
 * AUTO-GENERATED FILE
 * Retrieve the list of available commands.
 *
 * @returns {Object} The list and definitions of commands.
 */
exports.xcraftCommands = function() {
  return require(\`./widgets/${name}/service.js\`);
};`;
