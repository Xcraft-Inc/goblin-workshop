'use strict';

const path = require('path');
const goblinName = path.basename(module.parent.filename, '.js');

const Goblin = require('xcraft-core-goblin');

// Define initial logic values
const logicState = {
  db: {},
  selected: null,
};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('id', action.get('id'));
  },
  update: (state, action) => {
    return state.set('db', action.get('branches'));
  },
  select: (state, action) => {
    const selected = state.get('selected');
    return state.set(
      'selected',
      selected === action.get('selectedId') ? null : action.get('selectedId')
    );
  },
};

Goblin.registerQuest(goblinName, 'create', function*(quest) {
  quest.goblin.defer(
    quest.sub(`*::cryo.updated`, branches => quest.me.update({branches}))
  );

  const branches = yield quest.cmd('cryo.branches');
  quest.me.update({branches});

  quest.do();
});

Goblin.registerQuest(goblinName, 'select', function(quest, selectedId) {
  quest.do();
});

Goblin.registerQuest(goblinName, 'update', function(quest, branches) {
  quest.do();
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

// Create a Goblin with initial state and handlers
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
