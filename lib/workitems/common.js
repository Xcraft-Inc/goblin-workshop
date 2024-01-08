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

const createGadgets = watt(function* (
  quest,
  goblinName,
  gadgets,
  registry,
  next
) {
  const desktopId = quest.getDesktop();
  const goblinId = quest.goblin.id;
  for (const key of Object.keys(gadgets)) {
    const gadget = gadgets[key];
    const newGadgetId = `${gadget.type}-gadget@${key}@${quest.goblin.id}`;
    registry[key] = {id: newGadgetId, type: gadget.type};

    if (gadgets[key].onActions) {
      for (const handler of Object.keys(gadgets[key].onActions)) {
        quest.goblin.defer(
          quest.sub(`*::${newGadgetId}.${handler}`, function* (
            err,
            {msg, resp}
          ) {
            const cmdName = string.jsify(`${key}-${handler}`);
            yield resp.cmd(
              `${goblinName}.${cmdName}`,
              Object.assign({id: goblinId}, msg.data)
            );
          })
        );
      }
    }

    yield quest.create(newGadgetId, {
      id: newGadgetId,
      desktopId,
      options: gadget.options || null,
    });
  }
});

const registerHinters = (goblinName, hinters) => {
  if (hinters) {
    Object.keys(hinters).forEach((h) => {
      Goblin.registerSafeQuest(goblinName, `change-${h}`, function* (
        quest,
        newValue
      ) {
        let hName = h;
        if (hinters[h].hinter) {
          hName = hinters[h].hinter;
        }
        const hinter = quest.getAPI(`${hName}-hinter@${h}@${quest.goblin.id}`);
        yield hinter.search({value: newValue, searchMode: 'fulltext'});
      });

      if (hinters[h].onAddNew) {
        Goblin.registerSafeQuest(
          goblinName,
          `add-new-${h}`,
          hinters[h].onAddNew
        );
      }

      if (hinters[h].onValidate) {
        Goblin.registerSafeQuest(
          goblinName,
          `hinter-validate-${h}`,
          hinters[h].onValidate
        );
      }

      if (hinters[h].onClear) {
        Goblin.registerSafeQuest(goblinName, `clear-${h}`, hinters[h].onClear);
      }
    });
  }
};

const registerActions = (goblinName, actions, rehydrate) => {
  if (actions) {
    Object.keys(actions).forEach((a) => {
      Goblin.registerSafeQuest(goblinName, a, function* (quest) {
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
      Goblin.registerSafeQuest(goblinName, a, function* (quest) {
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

const registerQuests = (goblinName, quests, options) => {
  if (quests) {
    Object.keys(quests).forEach((q) => {
      if (options && options[q]) {
        Goblin.registerSafeQuest(goblinName, q, quests[q], options[q]);
      } else {
        Goblin.registerSafeQuest(goblinName, q, quests[q]);
      }
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
    const state = yield quest.getState(entityId);
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
  const state = yield quest.getState(entityId);
  if (state && state.get('meta.id') === entityId) {
    return privateState ? state : state.del('private');
  }

  if (!privateState) {
    // try in warehouse
    const state = yield quest.warehouse.get({path: entityId});
    if (state && state.get('meta.id') === entityId) {
      return state;
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
    const entity = yield quest.getState(entityId);
    if (entity && entity.get('meta.id') === entityId) {
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
    entityId,
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

const openWizard = function* (
  quest,
  name,
  description,
  icon,
  form,
  kind,
  view
) {
  const deskId = quest.goblin.getX('desktopId');

  const desk = quest.getAPI(deskId);
  const wizardId = yield desk.addWorkitem({
    workitem: {
      name: `${name}-wizard`,
      description,
      view: view || 'default',
      icon: icon || 'solid/pencil',
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
      yield quest.sub.wait(`*::${quest.goblin.id}.<workitem-loaded>`);
    })
  );
  quest.goblin.defer(
    quest.sub(`*::*.<workitem-loaded>`, (err, {msg}) => {
      const {workitemId} = msg.data;
      if (workitemId === quest.goblin.id) {
        quest.goblin.setX(
          'loadWaiter',
          watt(function* (next) {
            yield setTimeout(next, 0);
          })
        );
      }
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

const getPropKind = (entityType, propName) => {
  const {configurations} = require('../entity-builder.js');
  let propType = undefined;
  let entityConfig = configurations[entityType];
  if (!entityConfig) {
    throw new Error('common.getPropType: Unknow entity type');
  }
  if (entityConfig.values && entityConfig.values[propName]) {
    propType = 'value';
  } else if (entityConfig.references && entityConfig.references[propName]) {
    propType = 'reference';
  } else if (entityConfig.properties && entityConfig.properties[propName]) {
    propType = 'property';
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

const canonicalizeValues = function (val) {
  if (val === undefined || val === null) {
    return null;
  }
  switch (val.constructor.name) {
    case 'Function':
      return null;
    case 'String':
      return val;
    case 'Array': {
      const newVal = [];
      for (const item of val) {
        const res = canonicalizeValues(item);
        if (res !== null) {
          newVal.push(res);
        }
      }
      return newVal;
    }
    case 'Object': {
      const newVal = {};
      Object.keys(val).forEach((key) => {
        const res = canonicalizeValues(val[key]);
        if (res !== null) {
          newVal[key] = res;
        }
      });
      return newVal;
    }
    // Native JS type
    // case 'Boolean':
    // case 'BigInt':
    // case 'Symbol':
    // case 'Number':
    // Custom class type
    // case 'BigNumber':
    default:
      return val.toString();
  }
};

//TODO:
//createEntity (payload)

module.exports = {
  jsifyQuestName: string.jsify,
  registerQuests,
  registerActions,
  registerEntityActions,
  registerHinters,
  createGadgets,
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
  getPropKind,
  canonicalizeValues,
};
