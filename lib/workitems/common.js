const Goblin = require('xcraft-core-goblin');

function isFunction(fn) {
  return typeof fn === 'function';
}

function isGenerator(fn) {
  return (
    fn &&
    isFunction(fn) &&
    fn.constructor &&
    fn.constructor.name === 'GeneratorFunction'
  );
}

const registerHinters = (goblinName, hinters) => {
  if (hinters) {
    Object.keys(hinters).forEach(h => {
      Goblin.registerQuest(goblinName, `change-${h}`, function(
        quest,
        newValue
      ) {
        const hinter = quest.getAPI(
          `${h}-finder@${quest.goblin.id}`,
          `${h}-hinter`
        );
        hinter.search({value: newValue});
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

const registerActions = (goblinName, actions) => {
  if (actions) {
    Object.keys(actions).forEach(a => {
      Goblin.registerQuest(goblinName, a, function(quest) {
        quest.do();
      });
    });
  }
};

const registerQuests = (goblinName, quests) => {
  if (quests) {
    Object.keys(quests).forEach(q => {
      Goblin.registerQuest(goblinName, q, quests[q]);
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
  return refExpr.match(/([^\[\]]+)(\[[^\]]*\])?$/)[1];
};

const referenceUseArity = refExpr => {
  return refExpr.match(/.+\[.*\]$/);
};

const getEntityQuest = function*(quest, entityId) {
  if (!entityId) {
    throw new Error('Unable to get entity: ', entityId);
  }

  try {
    const entity = yield quest.getAPI(entityId).get();
    return entity;
  } catch (_) {
    const entity = yield quest.warehouse.get({path: entityId});
    if (entity) {
      return entity;
    } else {
      const r = quest.getStorage('rethink');
      const type = entityId.split('@')[0];
      const document = yield r.get({table: type, documentId: entityId});
      if (!document) {
        throw new Error('Unable to get entity: ', entityId);
      }
      return document;
    }
  }
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
    entity,
    parentEntity: entity.meta.parentEntity,
    rootAggregateId: entity.meta.rootAggregateId,
    rootAggregatePath: entity.meta.rootAggregatePath,
    mustExist: true,
  });
  return api;
};

//TODO:
//createEntity (payload)

module.exports = {
  registerQuests,
  registerActions,
  registerHinters,
  isGenerator,
  isFunction,
  referenceUseArity,
  getReferenceArity,
  getReferenceType,
  getEntityQuest, //Get entity data from cache or storage
  loadEntityQuest, //Load existing entity in warehouse
};
