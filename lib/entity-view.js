'use strict';

const goblinName = 'entity-view';
const Goblin = require('xcraft-core-goblin');

// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    const entity = action.get('entity');
    entity.entityId = entity.id;
    delete entity.id;
    return state.set('', {
      ...action.get('entity'),
      id: action.get('id'),
    });
  },
  refresh: (state, action) => {
    const entity = action.get('entity');
    entity.entityId = entity.id;
    delete entity.id;
    return state.set('', {
      ...action.get('entity'),
      entityId: action.get('entityId'),
      id: action.get('id'),
    });
  },
};

//View ex:
// [{'meta':{'summaries':['info']}},'status']
Goblin.registerQuest(goblinName, 'create', function(
  quest,
  desktopId,
  entity,
  view
) {
  quest.goblin.setX('desktopId', desktopId);
  quest.goblin.setX('view', view);
  quest.goblin.setX('entityId', entity.id);
  const goblinId = quest.goblin.id;
  quest.goblin.defer(
    quest.sub(`*::${entity.id}.changed`, function*(_, {resp}) {
      yield resp.cmd(`${goblinName}.refresh`, {
        id: goblinId,
      });
    })
  );

  quest.do();
  return quest.goblin.id;
});

Goblin.registerQuest(goblinName, 'refresh', function*(quest) {
  const entityId = quest.goblin.getX('entityId');
  const view = quest.goblin.getX('view');
  const state = yield quest.warehouse.get({path: entityId, view});
  if (state) {
    quest.do({id: quest.goblin.id, entityId, entity: state});
  }
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
