'use strict';

const goblinName = 'workitem-loader';
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
    'Goblin-Workshop: Workitem Loader [RUNNING]'
  );
  quest.goblin.defer(
    quest.sub('*::*.workitem-load-requested', (err, msg) => {
      msg.data.$orcName = msg.orcName;
      quest.me.load({...msg.data});
    })
  );
});

Goblin.registerQuest(goblinName, 'load', function*(
  quest,
  workitemId,
  desktopId
) {
  const id = workitemId;
  try {
    console.log('WorkitemLoader:', workitemId);
    const workitemAPI = yield quest.create(id, {id, desktopId});
    yield workitemAPI.loadGraph();
    yield workitemAPI.subscribeToEntity();
    yield workitemAPI.afterLoad();
  } catch (e) {
    console.log('WorkitemLoader: loading failed');
  } finally {
    quest.kill([id]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
