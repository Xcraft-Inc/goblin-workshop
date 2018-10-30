'use strict';

const goblinName = 'aggregate-updater';
const Goblin = require('xcraft-core-goblin');

// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'init', function(quest) {
  console.log(
    '\x1b[32m%s\x1b[0m',
    'Goblin-Workshop: Aggregate updater [RUNNING]'
  );
  quest.goblin.defer(
    quest.sub('*::*.update-aggregate-requested', (err, msg) => {
      const parentId = msg.data.parentId;
      const entity = msg.data.entity;
      const desktopId = msg.data.desktopId;
      quest.me.updateAggregate({
        parentId,
        desktopId,
        entity,
        $orcName: msg.orcName,
      });
    })
  );
});

Goblin.registerQuest(goblinName, 'update-aggregate', function*(
  quest,
  desktopId,
  parentId,
  entity
) {
  quest.log.verb(`Aggregate updater: updating  ${parentId} ...`);
  try {
    const parentAPI = yield quest.create(parentId, {
      id: parentId,
      desktopId,
    });
    yield parentAPI.waitLoaded();
    yield parentAPI.updateAggregate({entity});
    quest.log.verb(`Aggregate updater: updating   ${parentId}  [DONE]`);
  } catch (ex) {
    quest.log.err(
      `Aggregate updater: error during update , ${ex.stack || ex.message || ex}`
    );
  } finally {
    yield quest.kill([parentId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
