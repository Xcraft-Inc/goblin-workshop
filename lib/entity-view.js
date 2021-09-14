'use strict';

const goblinName = 'entity-view';
const Goblin = require('xcraft-core-goblin');
const merge = require('lodash/merge');
const isEqual = require('lodash/isEqual');

// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  'create': (state, action) => {
    const entity = action.get('entity');
    return state.set('', {
      ...action.get('entity'),
      entityId: entity.id,
      id: action.get('id'),
    });
  },
  'merge-view': (state, action) => {
    return state.set('', {
      ...action.get('entity'),
      entityId: state.get('entityId'),
      id: state.get('id'),
    });
  },
  'refresh': (state, action) => {
    return state.set('', {
      ...action.get('entity'),
      entityId: state.get('entityId'),
      id: state.get('id'),
    });
  },
};

//View ex:
// [{'meta':{'summaries':['info']}},'status']
Goblin.registerQuest(goblinName, 'create', function (
  quest,
  desktopId,
  entity,
  view
) {
  quest.goblin.setX('desktopId', desktopId);
  quest.goblin.setX('view', [...view]);
  quest.goblin.setX('entity', entity);
  const goblinId = quest.goblin.id;
  quest.goblin.defer(
    quest.sub(`*::${entity.id}.<entity-refreshed>`, function* (_, {resp}) {
      yield resp.cmd(`${goblinName}.refresh`, {
        id: goblinId,
      });
    })
  );

  quest.do();
  return quest.goblin.id;
});

Goblin.registerQuest(goblinName, 'merge-view', function (quest, view, entity) {
  const currentView = quest.goblin.getX('view');
  if (currentView !== view) {
    let viewChanged = false;
    for (const path of view) {
      if (!currentView.some((oldPath) => isEqual(oldPath, path))) {
        currentView.push(path);
        viewChanged = true;
      }
    }
    if (viewChanged) {
      const currentEntity = quest.goblin.getX('entity');
      const newEntity = {};
      merge(newEntity, currentEntity, entity);
      quest.goblin.setX('entity', newEntity);
      quest.do({entity: newEntity});
    }
  }
});

Goblin.registerQuest(goblinName, 'refresh', function* (quest) {
  const entity = quest.goblin.getX('entity');
  const view = quest.goblin.getX('view');
  const state = yield quest.warehouse.get({path: entity.id, view});
  if (state) {
    quest.goblin.setX('entity', {...state, id: entity.id});
    quest.do({entity: state});
  } else {
    quest.log.dbg(
      `Cannot refresh '${quest.goblin.id}' as the entity '${entity.id}' is not in the warehouse.`
    );
  }
});

Goblin.registerQuest(goblinName, 'delete', function (quest) {});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
