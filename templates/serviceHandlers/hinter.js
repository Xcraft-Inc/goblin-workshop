module.exports = type => `'use strict';
const {buildHinter} = require('goblin-rethink');
/**
 * Retrieve the list of available commands.
 *
 * @returns {Object} The list and definitions of commands.
 */
exports.xcraftCommands = function() {
  return buildHinter({
    type: '${type}',
    field: 'string',
  });
};`;
