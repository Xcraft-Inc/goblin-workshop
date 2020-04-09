'use strict';

const goblinName = 'entity-counter';
const Goblin = require('xcraft-core-goblin');
const {locks} = require('xcraft-core-utils');
const workshopConfig = require('xcraft-core-etc')().load('goblin-workshop');
const entityStorage = workshopConfig.entityStorageProvider.replace(
  'goblin-',
  ''
);
// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {
  'init-counter': (state, action) => {
    return state.set(action.get('type'), action.get('count'));
  },
  'get-next-number': (state, action) => {
    const current = state.get(action.get('type'));
    return state.set(action.get('type'), current + 1);
  },
};

Goblin.registerQuest(goblinName, 'init', function (quest) {
  console.log('\x1b[32m%s\x1b[0m', 'Goblin-Workshop: Entity Counter [RUNNING]');
});
const typeLocker = locks.getMutex;
Goblin.registerQuest(goblinName, 'get-next-number', function* (
  quest,
  desktopId,
  type
) {
  if (!desktopId) {
    throw new Error('Cannot generate a number without desktopId argument');
  }
  if (!type) {
    throw new Error('Cannot generate a number without type argument');
  }

  yield typeLocker.lock(type);
  quest.defer(() => typeLocker.unlock(type));

  const state = quest.goblin.getState();
  const counter = state.get(type, null);
  if (!counter) {
    const r = quest.getStorage(entityStorage);
    const count = yield r.count({table: type});
    quest.dispatch('init-counter', {type, count});
  }
  quest.do();
  const nextNumberByType = quest.goblin.getState().get(type);
  return `${Number.parseInt(nextNumberByType)}`;
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
