'use strict';

/**
 * Retrieve the inquirer definition for xcraft-core-etc
 */
module.exports = [
  {
    type: 'input',
    name: 'entityStorageProvider',
    message: 'Goblin providing storage quests',
    default: 'goblin-rethink',
  },
];
