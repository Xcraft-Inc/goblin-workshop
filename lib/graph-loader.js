'use strict';

const goblinName = 'graph-loader';
const Goblin = require('xcraft-core-goblin');

// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'init', function(quest) {
  console.log('\x1b[32m%s\x1b[0m', 'Goblin-Workshop: Graph Loader [RUNNING]');
  quest.goblin.setX('subs', {});
});

Goblin.registerQuest(goblinName, 'subscribe', function*(quest, goblinId) {
  const subs = quest.goblin.getX('subs');
  subs[goblinId] = quest.sub(
    `*::${goblinId}.loadgraph-requested`,
    (err, msg) => {
      msg.data.$orcName = msg.orcName;
      quest.me.load({...msg.data});
    }
  );
  yield quest.warehouse.updateCreatedBy({
    branch: goblinId,
    createdBy: goblinName,
  });
});

Goblin.registerQuest(goblinName, 'unsubscribe', function*(quest, goblinId) {
  const subs = quest.goblin.getX('subs');
  if (!subs[goblinId]) {
    return;
  }
  subs[goblinId]();
  delete subs[goblinId];
  yield quest.kill([goblinId]);
});

Goblin.registerQuest(goblinName, 'load', function*(quest, goblinId) {
  try {
    quest.log.verb('GraphLoader:', goblinId);
    const api = quest.getAPI(goblinId);
    if (api.afterLoad) {
      yield api.afterLoad();
    }
    yield api.loadGraph();
  } catch (ex) {
    quest.log.err(
      `GraphLoader: loading failed, ${ex.stack || ex.message || ex}`
    );
  } finally {
    yield quest.me.unsubscribe({goblinId});
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
