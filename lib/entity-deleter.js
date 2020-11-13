'use strict';

const goblinName = 'entity-deleter';
const Goblin = require('xcraft-core-goblin');
const {JobQueue} = require('xcraft-core-utils');

// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'init', function (quest, $msg) {
  console.log('\x1b[32m%s\x1b[0m', 'Goblin-Workshop: Entity deleter [RUNNING]');
  const deleteQueue = new JobQueue(
    'entity deleter',
    function* ({work, resp}) {
      yield resp.cmd(`${goblinName}.execute`, work);
    },
    100
  );

  quest.goblin.defer(
    quest.sub('*::workshop.<delete-entity-requested>', function (
      err,
      {msg, resp}
    ) {
      const entityId = msg.data.entityId;
      const desktopId = msg.data.desktopId;
      deleteQueue.push({
        id: entityId,
        work: {
          desktopId,
          entityId,
          $orcName: msg.orcName,
        },
        resp,
      });
    })
  );
});

Goblin.registerQuest(goblinName, 'execute', function* (
  quest,
  desktopId,
  entityId
) {
  try {
    const entityAPI = yield quest.create(entityId, {
      id: entityId,
      desktopId: quest.getSystemDesktop(),
    });
    yield entityAPI.hardDeleteEntity();
  } finally {
    yield quest.kill([entityId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
