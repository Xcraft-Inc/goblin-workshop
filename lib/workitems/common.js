'use strict';

const Goblin = require('xcraft-core-goblin');
const watt = require('gigawatts');
const {string, js} = require('xcraft-core-utils');
const workshopConfig = require('xcraft-core-etc')().load('goblin-workshop');
const {checkNewEntity} = require('../entity-check-helpers.js');
const a = require('xcraft-core-utils/lib/async.js');
const entityStorage = workshopConfig.entityStorageProvider.replace(
  'goblin-',
  ''
);

const registerHinters = (goblinName, hinters) => {
  if (hinters) {
    Object.keys(hinters).forEach((h) => {
      Goblin.registerQuest(goblinName, `change-${h}`, function* (
        quest,
        newValue
      ) {
        let hName = h;
        if (hinters[h].hinter) {
          hName = hinters[h].hinter;
        }
        const hinter = quest.getAPI(
          `${h}-finder@${quest.goblin.id}`,
          `${hName}-hinter`
        );
        yield hinter.search({value: newValue, searchMode: 'fulltext'});
      });

      if (hinters[h].onAddNew) {
        Goblin.registerQuest(goblinName, `add-new-${h}`, hinters[h].onAddNew);
      }

      if (hinters[h].onValidate) {
        Goblin.registerQuest(
          goblinName,
          `hinter-validate-${h}`,
          hinters[h].onValidate
        );
      }
    });
  }
};

const registerActions = (goblinName, actions, rehydrate) => {
  if (actions) {
    Object.keys(actions).forEach((a) => {
      Goblin.registerQuest(goblinName, a, function* (quest) {
        yield quest.doSync();
        if (rehydrate) {
          yield rehydrate(quest);
        }
      });
    });
  }
};

const registerEntityActions = (goblinName, actions, rehydrate) => {
  if (actions) {
    Object.keys(actions).forEach((a) => {
      Goblin.registerQuest(goblinName, a, function* (quest) {
        const beforeActionState = quest.goblin.getState();
        yield quest.doSync();
        const entity = quest.goblin.getState().toJS();
        const isClean = yield* checkNewEntity(
          quest,
          'entityAction',
          goblinName,
          entity
        );
        if (!isClean) {
          quest.dispatch('rollback-state', {state: beforeActionState});
        }
        if (rehydrate) {
          yield rehydrate(quest);
        }
      });
    });
  }
};

const registerQuests = (goblinName, quests) => {
  if (quests) {
    Object.keys(quests).forEach((q) => {
      Goblin.registerQuest(goblinName, q, quests[q]);
    });
  }
};

const getReferenceArity = (refExpr) => {
  let arity = '';
  const match = refExpr.match(/.+\[(.+)+\]$/);
  if (match && match.length === 2) {
    arity = match[1];
  }
  switch (arity) {
    case '1':
    case '1-1':
    case '1..1':
      return '1..1';
    case '1-n':
    case '1..n':
      return '1..n';
    case '0-1':
    case '0..1':
      return '0..1';
    case '':
    case '0':
    case '0-n':
    case '0..n':
    default:
      return '0..n';
  }
};

const getReferenceType = (refExpr) => {
  return refExpr.match(/([^[\]]+)(\[[^\]]*\])?$/)[1];
};

const referenceUseArity = (refExpr) => {
  return !!refExpr.match(/.+\[.*\]$/);
};

const getEntityState = function* (quest, path) {
  const entityId = quest.goblin.getX('entityId');
  // try locally
  if (entityId) {
    const state = quest.getState(entityId);
    if (state) {
      if (path) {
        return state.get(path, null);
      } else {
        return state;
      }
    }
    const eAPI = quest.getAPI(entityId);
    return yield eAPI.get({path});
  }
  quest.log.warn('Workitem is unloading, getEntityState as failed');
  return null;
};

const getEntityQuest = function* (quest, entityId, privateState = false) {
  if (!entityId) {
    throw new Error('EntityId not provided!');
  }

  // try locally first
  const state = quest.getState(entityId);
  if (state) {
    if (state.get('meta.id') === entityId) {
      return privateState ? state : state.del('private');
    }
  }

  const r = quest.getStorage(entityStorage);
  const type = entityId.split('@', 1)[0];

  const document = yield r.get({
    table: type,
    documentId: entityId,
    privateState,
  });

  if (!document) {
    return null;
  }
  return new Goblin.Shredder(document);
};

const getEntitiesQuest = function* (quest, type, entityIds) {
  const entities = [];
  const entitiesMap = {};
  const missingIds = [];

  // try locally first
  for (const entityId of entityIds) {
    const entity = quest.getState(entityId);
    if (entity) {
      entities.push(entity);
      entitiesMap[entityId] = entity;
    } else {
      missingIds.push(entityId);
    }
  }

  if (missingIds.length === 0) {
    return entities;
  }

  const r = quest.getStorage(entityStorage);

  //map fetched (async because shredding takes time)
  const fetched = yield a.mapReduce(
    (entity) => entity.id,
    (entity) => new Goblin.Shredder(entity),
    yield r.getAll({table: type, documents: missingIds})
  );

  //return final array in entityIds order
  return entityIds.reduce((remap, id) => {
    if (entitiesMap[id]) {
      remap.push(entitiesMap[id]);
    } else if (fetched[id]) {
      remap.push(fetched[id]);
    } else {
      throw new Error(
        `getEntities: failed to find ${id} entity in cache or storage`
      );
    }
    return remap;
  }, []);
};

const loadEntityQuest = function* (quest, entityId) {
  if (!entityId) {
    throw new Error('Unable to get entity: ', entityId);
  }
  const desktopId = quest.goblin.getX('desktopId');
  const entity = yield quest.me.getEntity({entityId: entityId});
  const workshop = quest.getAPI('workshop');
  yield workshop.createEntity({
    id: entityId,
    createFor: quest.goblin.id,
    desktopId,
    properties: {
      loadedBy: quest.goblin.id,
      parentEntity: entity.get('meta.parentEntity'),
      rootAggregateId: entity.get('meta.rootAggregateId'),
      rootAggregatePath: entity
        .get('meta.rootAggregatePath')
        .valueSeq()
        .toArray(),
      mustExist: true,
    },
  });
};

const openWizard = function* (quest, name, form, kind, view) {
  const deskId = quest.goblin.getX('desktopId');

  const desk = quest.getAPI(deskId);
  const wizardId = yield desk.addWorkitem({
    workitem: {
      name: `${name}-wizard`,
      description: name,
      view: view || 'default',
      icon: 'solid/pencil',
      kind: kind || 'tab',
      isClosable: true,
      payload: {
        form: form,
      },
    },
    navigate: true,
  });
  return wizardId;
};

// Little pattern for wait-loaded quest
// if loadWaiter func is called during after-create
// the func will wait the loaded evt
// if the after-create as loaded, the func is erased by an async nop
// when called, we wait an async nop ;)
const createWaitLoader = function (quest) {
  quest.goblin.setX(
    'loadWaiter',
    watt(function* () {
      yield quest.sub.localWait(`*::${quest.goblin.id}.<workitem-loaded>`);
    })
  );
  quest.goblin.defer(
    quest.sub.local(`*::${quest.goblin.id}.<workitem-loaded>`, () => {
      quest.goblin.setX(
        'loadWaiter',
        watt(function* (next) {
          yield setTimeout(next, 0);
        })
      );
    })
  );
};

// /!\ used in conjuction with createWaitLoader
// your goblin must emit a 'loaded' event
const waitLoadedQuest = function* (quest) {
  const waiter = quest.goblin.getX('loadWaiter');
  if (!waiter) {
    throw new Error('waitLoaded called too early...');
  }
  yield waiter();
  quest.dispatch('set-loading', {loading: false});
};

const getAggregationInfo = function (quest) {
  const meta = quest.goblin.getState().get('meta');
  const info = {
    rootAggregateId: meta.get('rootAggregateId'),
    rootAggregatePath: meta.get('rootAggregatePath').valueSeq().toArray(),
  };
  return info;
};

const getPropType = (entityType, propName) => {
  const {configurations} = require('../entity-builder.js');
  let propType = undefined;
  let entityConfig = configurations[entityType];
  if (!entityConfig) {
    throw new Error('common.getPropType: Unknow entity type');
  }
  if (entityConfig.values && entityConfig.values[propName]) {
    propType = getReferenceType(entityConfig.values[propName]);
  } else if (entityConfig.references && entityConfig.references[propName]) {
    propType = getReferenceType(entityConfig.references[propName]);
  } else if (entityConfig.properties && entityConfig.properties[propName]) {
    propType = entityConfig.properties[propName].type;
  }
  return propType;
};

const openEntityWorkitemQuest = (workitems) =>
  function* (quest, entityId, desktopId, navigate = true) {
    if (!entityId) {
      return;
    }

    const desk = quest.getAPI(desktopId);
    let entityType = null;
    entityType = entityId.split('@', 1)[0];

    let workitemName = `${entityType}-workitem`;
    if (workitems && workitems[entityType]) {
      workitemName = workitems[entityType];
    }

    yield desk.addWorkitem({
      workitem: {
        id: quest.uuidV4(),
        name: workitemName,
        view: 'default',
        icon: 'solid/pencil',
        kind: 'tab',
        isClosable: true,
        payload: {
          entityId,
        },
      },
      navigate: navigate,
    });
  };

//TODO:
//createEntity (payload)

module.exports = {
  jsifyQuestName: string.jsify,
  registerQuests,
  registerActions,
  registerEntityActions,
  registerHinters,
  isGenerator: js.isGenerator,
  isFunction: js.isFunction,
  referenceUseArity,
  getReferenceArity,
  getReferenceType,
  getEntityState, // Get entity state from cache or storage (for workitems and plugins)
  getEntityQuest, // Get entity data from cache or storage
  getEntitiesQuest, // Experimental multiple get in cache or storage
  loadEntityQuest, // Load existing entity in warehouse,
  openEntityWorkitemQuest,
  openWizard,
  createWaitLoader,
  waitLoadedQuest,
  getAggregationInfo,
  getPropType,
};
