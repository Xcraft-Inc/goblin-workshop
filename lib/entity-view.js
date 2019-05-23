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

const setAtPath = (obj, keyPath, value) => {
  const lastKeyIndex = keyPath.length - 1;
  for (var i = 0; i < lastKeyIndex; ++i) {
    const key = keyPath[i];
    if (!(key in obj)) obj[key] = {};
    obj = obj[key];
  }
  obj[keyPath[lastKeyIndex]] = value;
};

//TODO: better support
// Partially respect quick rethink db pluck syntax
const pluckPath = (entity, state, selection, prevPath) => {
  for (const key of Object.keys(selection)) {
    const select = selection[key];
    if (Array.isArray(select)) {
      for (const prop of select) {
        let path = `${prevPath ? `${prevPath}.` : ''}${key}.${prop}`;
        const value = state.get(path).toJS();
        setAtPath(entity, path.split('.'), value);
      }
    } else {
      pluckPath(
        entity,
        state,
        select,
        `${prevPath ? `${prevPath}.` : ''}${key}`
      );
    }
  }
};

Goblin.registerQuest(goblinName, 'refresh', function*(quest) {
  const entityId = quest.goblin.getX('entityId');
  const view = quest.goblin.getX('view');
  const state = yield quest.warehouse.get({path: entityId});
  if (state) {
    const entity = view.reduce((e, path) => {
      if (typeof path === 'string') {
        e[path] = state.get(path);
      } else {
        pluckPath(e, state, path, null);
      }
      return e;
    }, {});
    quest.do({id: quest.goblin.id, entity});
  }
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
