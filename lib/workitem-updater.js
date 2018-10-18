'use strict';

const goblinName = 'workitem-updater';
const Goblin = require('xcraft-core-goblin');
const {locks} = require('xcraft-core-utils');
const _ = require('lodash');
// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'init', function(quest) {
  console.log(
    '\x1b[32m%s\x1b[0m',
    'Goblin-Workshop: Workitem updater [RUNNING]'
  );
});

const entityIdMutex = new locks.RecursiveMutex();
const subs = {};
const updater = quest =>
  _.debounce((err, msg) => {
    const {id} = msg.data;
    if (subs[id]) {
      quest.me.updateWorkitems({entityId: id});
    }
  }, 100);
Goblin.registerQuest(goblinName, 'subscribe', function*(
  quest,
  entityId,
  workitemId
) {
  yield entityIdMutex.lock(entityId);
  quest.defer(() => entityIdMutex.unlock(entityId));
  if (!subs[entityId]) {
    const unsub = quest.sub(`*::${entityId}.changed`, updater(quest));
    subs[entityId] = {unsub, workitems: []};
    subs[entityId].workitems.push(workitemId);
  } else {
    subs[entityId].workitems.push(workitemId);
  }
});

Goblin.registerQuest(goblinName, 'unsubscribe', function*(
  quest,
  desktopId,
  entityId,
  workitemId
) {
  yield entityIdMutex.lock(entityId);
  quest.defer(() => entityIdMutex.unlock(entityId));
  if (subs[entityId]) {
    const index = subs[entityId].workitems.indexOf(workitemId);
    if (index > -1) {
      subs[entityId].workitems.splice(index, 1);
    }
    if (subs[entityId].workitems.length === 0) {
      subs[entityId].unsub();
      delete subs[entityId];
    }
  }
});

Goblin.registerQuest(goblinName, 'update-workitems', function*(
  quest,
  entityId,
  next
) {
  yield entityIdMutex.lock(entityId);
  quest.defer(() => entityIdMutex.unlock(entityId));
  try {
    if (subs[entityId]) {
      const id = subs[entityId].workitems[0];
      const workitemAPI = yield quest.create(id, {id, desktopId: null});

      // Trigger update onetime for all
      if (workitemAPI.update) {
        yield workitemAPI.update();
      }

      // Update buttons state for all
      for (const id of subs[entityId].workitems.values()) {
        quest.create(id, {id, desktopId: null}, next.parallel());
      }
      const toUpdateAPIs = yield next.sync();
      for (const api of toUpdateAPIs.values()) {
        api.updateButtons({}, next.parallel());
      }
      yield next.sync();
    }
  } catch (ex) {
    quest.log.err(
      `Workitem updater: error during update, ${ex.stack || ex.message || ex}`
    );
  } finally {
    yield quest.kill(subs[entityId].workitems);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
