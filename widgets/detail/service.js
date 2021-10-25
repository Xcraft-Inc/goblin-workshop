'use strict';
//T:2019-02-27

const Goblin = require('xcraft-core-goblin');
const watt = require('gigawatts');
const {locks} = require('xcraft-core-utils');
const goblinName = 'detail';

// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  'create': (state, action) => {
    const id = action.get('id');
    return state.set('', {
      id: id,
      type: action.get('type'),
      title: action.get('title'),
      detailWidget: action.get('detailWidget'),
      detailWidgetId: null,
      entityId: null,
      kind: action.get('kind'),
      width: action.get('width'),
    });
  },
  'set-entity': (state, action) => {
    return state
      .set('detailWidgetId', action.get('widgetId'))
      .set('entityId', action.get('entityId'))
      .set('loading', false);
  },
  'set-loading': (state) => {
    return state.set('loading', true);
  },
  'unset-loading': (state) => {
    return state.set('loading', false);
  },
};

// Register quest's according rc.json

Goblin.registerQuest(goblinName, 'create', function (
  quest,
  desktopId,
  id,
  name,
  type,
  title,
  detailWidget,
  kind,
  width
) {
  if (!name) {
    name = type;
  }
  quest.goblin.setX('desktopId', desktopId);
  quest.goblin.setX('name', name);
  quest.goblin.setX('workitem', detailWidget);
  quest.goblin.setX('workitems', {});
  quest.goblin.setX('seed', quest.uuidV4());
  quest.do({id, type, title, detailWidget, kind, width});
  return quest.goblin.id;
});

const killAndWait = watt(function* (quest, id) {
  //KILL AND WAIT
  yield quest.sub.callAndWait(function* () {
    yield quest.kill(id);
  }, `*::<${id}.deleted>`);
});

const mutex = locks.getMutex;
Goblin.registerQuest(goblinName, 'set-entity', function* (
  quest,
  entityId,
  next
) {
  quest.defer(() => mutex.unlock(quest.goblin.id));
  yield mutex.lock(quest.goblin.id);

  const state = quest.goblin.getState();
  if (state.get('entityId') === entityId) {
    quest.dispatch('unset-loading');
    return;
  }
  const desktopId = quest.goblin.getX('desktopId');
  const workitem = quest.goblin.getX('workitem');
  const seed = quest.goblin.getX('seed');
  const workitemId = `${workitem}@readonly@${desktopId}@${seed}-${entityId}`;
  let workitems = quest.goblin.getX('workitems');
  if (workitems[workitemId]) {
    quest.do({widgetId: workitemId, entityId});
    return;
  }

  //LOAD NEW WORKITEM IN CACHE
  const cache = Object.keys(workitems);
  if (cache.length > 10) {
    quest.dispatch('set-loading');
    for (const id of cache) {
      killAndWait(quest, id, next.parallel());
    }
    yield next.sync();
    quest.goblin.setX('workitems', {});
  }
  workitems = quest.goblin.getX('workitems');
  if (!workitems[workitemId]) {
    yield quest.create(workitemId, {
      id: workitemId,
      desktopId,
      entityId: entityId,
      inMemory: true,
      mode: 'readonly',
    });
    workitems[workitemId] = workitemId;
  }
  quest.do({widgetId: workitemId, entityId});
});

Goblin.registerQuest(goblinName, 'set-loading', function (quest) {
  quest.do();
});

Goblin.registerQuest(goblinName, 'delete', function (quest) {
  quest.log.info('Deleting detail...');
});

// Create a Goblin with initial state and handlers
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
