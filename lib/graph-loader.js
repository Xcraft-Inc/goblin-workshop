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
  quest.goblin.defer(
    quest.sub('*::*.workitem-loadgraph-requested', (err, msg) => {
      msg.data.$orcName = msg.orcName;
      quest.me.workitemLoad({...msg.data});
    })
  );
  quest.goblin.defer(
    quest.sub('*::*.entity-loadgraph-requested', (err, msg) => {
      msg.data.$orcName = msg.orcName;
      quest.me.entityLoad({...msg.data});
    })
  );
});

Goblin.registerQuest(goblinName, 'workitem-load', function*(
  quest,
  workitemId,
  desktopId
) {
  const id = workitemId;
  try {
    quest.log.verb('GraphLoader:', workitemId);
    const workitemAPI = yield quest.create(id, {id, desktopId});
    yield workitemAPI.afterLoad();
    const res = yield workitemAPI.loadGraph();
    if (quest.isCanceled(res)) {
      return;
    }
  } catch (ex) {
    quest.log.err(
      `GraphLoader: loading failed, ${ex.stack || ex.message || ex}`
    );
  } finally {
    yield quest.kill([id]);
  }
});

Goblin.registerQuest(goblinName, 'entity-load', function*(
  quest,
  entity,
  desktopId
) {
  const id = entity.get('id');
  try {
    quest.log.verb('GraphLoader:', id);
    const entityAPI = yield quest.create(id, {
      id: id,
      desktopId: desktopId,
      mustExist: true,
      entity,
      rootAggregateId: entity.get('meta.rootAggregateId'),
      rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
    });
    let res = yield entityAPI.loadGraph();
    if (quest.isCanceled(res)) {
      return;
    }
  } catch (ex) {
    quest.log.err(
      `GraphLoader: loading failed, ${ex.stack || ex.message || ex}`
    );
  } finally {
    yield quest.kill([id]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
