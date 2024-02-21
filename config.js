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
  {
    type: 'input',
    name: 'entityCheckerPolicy',
    message: 'define policy loose|strict',
    default: 'loose',
  },
  {
    type: 'input',
    name: 'mustExistPolicy',
    message: 'define policy loose|strict',
    default: 'loose',
  },
  {
    type: 'input',
    name: 'entityStorageServicePoolSize',
    message: 'Number of goblin storage instanciated and available in pool',
    default: 10,
  },
  {
    type: 'confirm',
    name: 'enableUndoEditFlow',
    message: 'User need to submit changes, and can rollback editions',
    default: false,
  },
  {
    type: 'confirm',
    name: 'enableMultiLanguageIndex',
    message: 'Define if indexer must use nabu locales',
    default: false,
  },
];
