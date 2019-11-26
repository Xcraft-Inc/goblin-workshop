module.exports = type => `'use strict';

/**
 * AUTO-GENERATED FILE
 * Setup workitem service for an entity
 */

const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: '${type}',
  kind: 'workitem',
};

module.exports = buildWorkitem(config);`;
