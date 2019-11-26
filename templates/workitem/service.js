module.exports = name => `'use strict';

/**
 * AUTO-GENERATED FILE
 * Retrieve the list of available commands.
 *
 * @returns {Object} The list and definitions of commands.
 */

const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: 'listItem',
  kind: 'workitem',
};

module.exports = buildWorkitem(config);`;
