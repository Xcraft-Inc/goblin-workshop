const Goblin = require('xcraft-core-goblin');
const watt = require('gigawatts');
const xUtils = require('xcraft-core-utils');

const registerHinters = (goblinName, hinters) => {
  if (hinters) {
    Object.keys(hinters).forEach(h => {
      Goblin.registerQuest(goblinName, `change-${h}`, function*(
        quest,
        newValue
      ) {
        const hinter = quest.getAPI(
          `${h}-finder@${quest.goblin.id}`,
          `${h}-hinter`
        );
        yield hinter.search({value: newValue});
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
    Object.keys(actions).forEach(a => {
      Goblin.registerQuest(goblinName, a, function*(quest) {
        quest.do();
        if (rehydrate) {
          yield rehydrate(quest);
        }
      });
    });
  }
};

const registerQuests = (goblinName, quests) => {
  if (quests) {
    Object.keys(quests).forEach(q => {
      const params = xUtils.reflect
        .funcParams(quests[q])
        .filter(param => !/^(quest|next)$/.test(param));
      Goblin.registerQuest(goblinName, q, function*(quest, $msg, next) {
        const args = params.map(p => {
          return $msg.get(p);
        });
        const createParams = quest.goblin.getX('createParams');
        if (!createParams) {
          console.log(quest.goblin.id, ' missing....');
          return null;
        }
        const runId = quest.uuidV4();
        const payload = Object.assign(
          {
            runId,
            goblinId: quest.goblin.id,
            questToRun: q,
            desktopId: createParams.desktopId,
            feeds: Object.keys(quest.goblin.feed),
          },

          params.reduce((runParams, p, index) => {
            if (args[index] !== undefined) {
              runParams[`$param-${p}`] = args[index];
            }
            return runParams;
          }, {})
        );

        return yield quest.cmd(`quest-runner.run`, payload);
      });
      Goblin.registerQuest(goblinName, `_$${q}`, quests[q]);
    });
  }
};

const getReferenceArity = refExpr => {
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

const getReferenceType = refExpr => {
  return refExpr.match(/([^[\]]+)(\[[^\]]*\])?$/)[1];
};

const referenceUseArity = refExpr => {
  return refExpr.match(/.+\[.*\]$/);
};

const getEntityState = function*(quest, path) {
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

const getEntityQuest = function*(quest, entityId, privateState = false) {
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

  const r = quest.getStorage('rethink');
  const type = entityId.split('@')[0];
  const document = yield r.get({
    table: type,
    documentId: entityId,
    privateState,
  });
  if (!document) {
    throw new Error(`Unable to get entity: ${entityId}`);
  }
  return new Goblin.Shredder(document);
};

const getEntitiesQuest = function*(quest, type, entityIds, next) {
  const entities = [];
  const notFoundIndex = [];

  // try locally first
  entityIds.reduce((entities, entityId, i) => {
    const entity = quest.getState(entityId);
    if (entity) {
      entities.push(entity);
    } else {
      notFoundIndex.push(i);
    }
    return entities;
  }, entities);

  if (notFoundIndex.length === 0) {
    return entities;
  }
  // remap with not founds
  const missingIds = notFoundIndex.map(index => entityIds[index]);
  const r = quest.getStorage('rethink');
  const fetched = yield r.getAll({table: type, documents: missingIds});
  fetched.reduce((entities, entity) => {
    entities.push(new Goblin.Shredder(entity));
    return entities;
  }, entities);
  return entities;
};

const loadEntityQuest = function*(quest, entityId) {
  if (!entityId) {
    throw new Error('Unable to get entity: ', entityId);
  }
  const desktopId = quest.goblin.getX('desktopId');
  const entity = yield quest.me.getEntity({entityId: entityId});

  const api = yield quest.create(entityId, {
    id: entityId,
    desktopId,
    loadedBy: quest.goblin.id,
    parentEntity: entity.get('meta.parentEntity'),
    rootAggregateId: entity.get('meta.rootAggregateId'),
    rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
    mustExist: true,
  });
  return api;
};

const openWizard = function*(quest, name, form, kind) {
  const deskId = quest.goblin.getX('desktopId');

  const desk = quest.getAPI(deskId);
  const wizardId = yield desk.addWorkitem({
    workitem: {
      name: `${name}-wizard`,
      description: name,
      view: 'default',
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
const createWaitLoader = function(quest) {
  quest.goblin.setX(
    'loadWaiter',
    watt(function*() {
      yield quest.sub.wait(`*::${quest.goblin.id}.loaded`);
    })
  );
  quest.goblin.defer(
    quest.sub(`*::${quest.goblin.id}.loaded`, () => {
      quest.goblin.setX(
        'loadWaiter',
        watt(function*(next) {
          yield setTimeout(next, 0);
        })
      );
    })
  );
};

// /!\ used in conjuction with createWaitLoader
// your goblin must emit a 'loaded' event
const waitLoadedQuest = function*(quest) {
  const waiter = quest.goblin.getX('loadWaiter');
  if (!waiter) {
    throw new Error('waitLoaded called too early...');
  }
  yield waiter();
};

const getAggregationInfo = function(quest) {
  const meta = quest.goblin.getState().get('meta');
  const info = {
    rootAggregateId: meta.get('rootAggregateId'),
    rootAggregatePath: meta.get('rootAggregatePath').toArray(),
  };
  return info;
};

//TODO:
//createEntity (payload)

module.exports = {
  jsifyQuestName: xUtils.string.jsify,
  registerQuests,
  registerActions,
  registerHinters,
  isGenerator: xUtils.js.isGenerator,
  isFunction: xUtils.js.isFunction,
  referenceUseArity,
  getReferenceArity,
  getReferenceType,
  getEntityState, // Get entity state from cache or storage (for workitems and plugins)
  getEntityQuest, // Get entity data from cache or storage
  getEntitiesQuest, // Experimental multiple get in cache or storage
  loadEntityQuest, // Load existing entity in warehouse
  openWizard,
  createWaitLoader,
  waitLoadedQuest,
  getAggregationInfo,
};
