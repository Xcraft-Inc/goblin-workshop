'use strict';

const goblinName = 'entity-clean-worker';
const Goblin = require('xcraft-core-goblin');

/******************************************************************************/

// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('id', action.get('id'));
  },
};

/******************************************************************************/

Goblin.registerQuest(goblinName, 'create', function (quest) {
  quest.do();
});

/******************************************************************************/

Goblin.registerQuest(goblinName, 'patch-entity', function* (
  quest,
  desktopId,
  entityId,
  patch,
  rootAggregateId,
  rootAggregatePath
) {
  const id = entityId;
  if (id === undefined) {
    quest.log.warn('cleaning: bad entity provided, something goes wrong...');
    return;
  }
  quest.log.verb(`Cleaner Worker: patching ${id} ...`);
  try {
    const entityAPI = yield quest.create(id, {
      id: id,
      desktopId: quest.getSystemDesktop(),
      mustExist: true,
      rootAggregateId,
      rootAggregatePath,
    });

    yield entityAPI.apply({
      patch,
      force: true,
      muteChanged: true,
      muteHydrated: true,
    });
    yield entityAPI.persist();

    quest.log.verb(`Cleaner Worker: patching  ${id} [DONE]`);
  } catch (ex) {
    const err = `Cleaner Worker: error during patching, ${
      ex.stack || ex.message || ex
    }`;
    quest.log.err(err);
    throw new Error(err);
  }
});

/******************************************************************************/

Goblin.registerQuest(goblinName, 'clean-entity', function* (
  quest,
  desktopId,
  entityId,
  propsToRemove,
  pointerToRemove,
  rootAggregateId,
  rootAggregatePath
) {
  const id = entityId;
  if (id === undefined) {
    quest.log.warn('cleaning: bad entity provided, something goes wrong...');
    return;
  }
  quest.log.verb(`Cleaner Worker: cleaning props ${id} ...`);
  try {
    // TODO -> crash!!!
    const entityAPI = yield quest.create(id, {
      id: id,
      desktopId: quest.getSystemDesktop(),
      mustExist: true,
      rootAggregateId,
      rootAggregatePath,
    });

    // TODO!!!
    // yield entityAPI.removeProperties({propsToRemove});
    // yield entityAPI.removePointers({pointerToRemove});

    quest.log.verb(`Cleaner Worker: cleaning props  ${id} [DONE]`);
  } catch (ex) {
    const err = `Cleaner Worker: error during cleaning props, ${
      ex.stack || ex.message || ex
    }`;
    quest.log.err(err);
    throw new Error(err);
  }
});

/******************************************************************************/

Goblin.registerQuest(goblinName, 'delete', function (quest) {});

/******************************************************************************/

module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
