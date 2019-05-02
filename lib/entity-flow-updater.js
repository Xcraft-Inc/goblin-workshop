'use strict';

const goblinName = 'entity-flow-updater';
const Goblin = require('xcraft-core-goblin');
// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(
  goblinName,
  'init',
  function(quest) {
    console.log(
      '\x1b[32m%s\x1b[0m',
      'Goblin-Workshop: Entity Flow Updater [RUNNING]'
    );
    quest.goblin.defer(
      quest.sub(`*::*.(publish|restore|archive|trash)-requested`, function*(
        err,
        {msg, resp}
      ) {
        const verb = msg.data.verb;
        const entity = msg.data.entity;
        const desktopId = msg.data.desktopId;
        const requestedBy = msg.data.requestedBy;
        yield resp.cmd(`${goblinName}.start-worker`, {
          desktopId,
          entity,
          verb,
          requestedBy,
          $orcName: msg.orcName,
        });
      })
    );
  },
  [`*::*.(publish|restore|archive|trash)-requested`]
);

Goblin.registerQuest(goblinName, 'start-worker', function*(
  quest,
  desktopId,
  requestedBy,
  verb,
  entity
) {
  const workerId = `entity-flow-updater-worker@${quest.uuidV4()}@${entity.get(
    'id'
  )}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
    });
    yield workerAPI.changeStatus({
      desktopId,
      verb,
      entity,
      requestedBy,
    });
  } catch (ex) {
    throw ex;
  } finally {
    yield quest.kill([workerId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
