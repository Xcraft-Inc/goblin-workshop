'use strict';

const goblinName = 'quest-runner';
const Goblin = require('xcraft-core-goblin');

// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'init', function(quest) {
  console.log('\x1b[32m%s\x1b[0m', 'Goblin-Workshop: Quest Runner [RUNNING]');
});

Goblin.registerQuest(goblinName, 'run', function() {
  throw new Error('QUEST RUNNER MUST NOT BE USED');
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
