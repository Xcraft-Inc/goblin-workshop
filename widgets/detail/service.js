'use strict';
//T:2019-02-27

const Goblin = require('xcraft-core-goblin');
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
  width,
  rootWorkitemId
) {
  if (!name) {
    name = type;
  }
  quest.goblin.setX('desktopId', desktopId);
  quest.goblin.setX('name', name);
  quest.goblin.setX('workitem', detailWidget);
  quest.goblin.setX('rootWorkitemId', rootWorkitemId);
  quest.do({id, type, title, detailWidget, kind, width});
  return quest.goblin.id;
});

const setMutex = new locks.RecursiveMutex();
Goblin.registerQuest(goblinName, 'set-entity', function* (quest, entityId) {
  yield setMutex.lock(quest.goblin.id);
  quest.defer(() => setMutex.unlock(quest.goblin.id));
  const desktopId = quest.goblin.getX('desktopId');
  const existing = quest.goblin.getState().get('detailWidgetId');
  if (existing) {
    if (entityId === quest.goblin.getState().get('entityId')) {
      quest.do({widgetId: existing, entityId});
      return;
    }
    yield quest.kill([existing]);
  }

  const workitem = quest.goblin.getX('workitem');
  const rootWorkitemId = quest.goblin.getX('rootWorkitemId');
  const workitemId = `${workitem}@readonly@${desktopId}@${quest.uuidV4()}`;
  yield quest.create(workitemId, {
    id: workitemId,
    desktopId,
    entityId: entityId,
    mode: 'readonly',
    rootWorkitemId,
  });

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
