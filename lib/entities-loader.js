'use strict';

const path = require('path');
const Goblin = require('xcraft-core-goblin');

const goblinName = path.basename(module.parent.filename, '.js');

const logicState = {};
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'ripley', function*(quest, db, timestamp) {
  quest.sub(`cryo.thawed.${db}`, (err, entry) => {});

  yield quest.cmd(`cryo.thaw`, {db});
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
