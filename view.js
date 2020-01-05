'use strict';

/**
 * Retrieve the list of available commands.
 *
 * @returns {Object} The list and definitions of commands.
 */
exports.xcraftCommands = function() {
  const type = require('path').basename(__filename, '.js');
  return require(`./entities/${type}.js`).service;
};
