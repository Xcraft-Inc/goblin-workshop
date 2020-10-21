'use strict';

const goblinName = 'activity-monitor-led';
const Goblin = require('xcraft-core-goblin');

/******************************************************************************/

// Define initial logic values.
const logicState = {
  id: goblinName,
  isActive: false,
};

const logicHandlers = {
  init: (state) => state,
  active: (state, action) => state.set('isActive', !!action.get('on')),
};

/******************************************************************************/

Goblin.registerQuest(goblinName, 'active', function (quest, on) {
  quest.do();
});

/******************************************************************************/

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
