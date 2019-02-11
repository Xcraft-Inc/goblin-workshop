'use strict';

const goblinName = 'entity-driller-worker';
const Goblin = require('xcraft-core-goblin');
const xBus = require('xcraft-core-bus');

// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('id', action.get('id'));
  },
};

Goblin.registerQuest(goblinName, 'create', function(quest, desktopId) {
  quest.goblin.setX('desktopId', desktopId);
  quest.do();
});

Goblin.registerQuest(goblinName, 'drill-down', function*(
  quest,
  desktopId,
  entityIds,
  _goblinFeed,
  next
) {
  quest.log.verb(
    `Entity Driller Worker: drilling  ${entityIds.length} entities...`
  );
  try {
    entityIds.forEach(entityId =>
      quest.createFor(
        'list.drill-down',
        `goblin-cache@${xBus.getToken()}`,
        entityId,
        {
          id: entityId,
          mustExist: true,
          desktopId,
          _goblinTTL: 30000,
          _goblinFeed,
        },
        next.parallel()
      )
    );
    yield next.sync();
    quest.log.verb(
      `Entity Driller Worker: drilling  ${entityIds.length} entities [DONE]`
    );
  } catch (ex) {
    const err = `Entity Driller Workerr: error during drill-down, ${ex.stack ||
      ex.message ||
      ex}`;

    quest.log.err(err);
    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
