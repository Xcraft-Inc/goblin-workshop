'use strict';

const moduleName = 'entity-builder';

const xLog = require('xcraft-core-log')(moduleName, null);
const watt = require('gigawatts');
const Goblin = require('xcraft-core-goblin');
const Shredder = require('xcraft-core-shredder');
const xUtils = require('xcraft-core-utils');
const entityMeta = require('./entity-meta');
const common = require('./workitems/common.js');
const {BigNumber} = require('bignumber.js');
const MarkdownBuilder = require('./markdown-builder.js');
const StringBuilder = require('goblin-nabu/lib/string-builder.js');
const workshopConfig = require('xcraft-core-etc')().load('goblin-workshop');
const {
  checkNewEntity,
  checkProperty,
  checkSummaries,
  checkSums,
  completesEntityWithDefaultValues,
  addEntityNotification,
  addFixNotification,
} = require('./entity-check-helpers.js');

const entityStorage = workshopConfig.entityStorageProvider.replace(
  'goblin-',
  ''
);

const {
  buildPeers,
  fetchValues,
  fetchPeers,
} = require('./entity-builder/peers.js');

const {
  buildReferencesQuests,
  buildValuesQuests,
} = require('./entity-builder/methods.js');

const buildMultiLanguageSummaries = require('goblin-nabu-store/lib/summaries.js');
const entityFlowValidStatus = ['draft', 'published', 'archived', 'trashed'];
const types = [];
const indexes = [];
const customIndexesByType = [];
const orderIndexesByType = [];
const indexerMappingsByType = [];
const configs = {};

// draft -> published -> archived
const getInitialStatus = watt(function* (
  quest,
  status,
  newEntityStatus,
  parentEntity
) {
  if (status) {
    return status;
  } else if (newEntityStatus) {
    return newEntityStatus;
  }

  let defaultStatus = 'draft';
  if (parentEntity) {
    const parent = yield quest.warehouse.get({path: parentEntity});
    if (parent) {
      return parent.get('meta.status', defaultStatus);
    }
  }
  return defaultStatus;
});

const handleCollectionChanged = (quest, desktopId, skipped) =>
  function* (err, {msg}) {
    const wAPI = quest.getAPI('workshop');
    const extractEntityId = (msg) => msg.data.entityId;
    const extractType = (msg) =>
      msg.data.entityType
        ? msg.data.entityType
        : msg.data.entityId.split('@', 1)[0];
    const handleType = (msg) => !skipped.includes(extractType(msg));

    if (handleType(msg)) {
      const {eventType} = msg.data;
      const entityId = extractEntityId(msg);
      switch (eventType) {
        case 'cleared':
          yield quest.kill([msg.data.entityIds]);
          break;
        case 'added':
          yield wAPI.createEntity({
            id: entityId,
            createFor: quest.goblin.id,
            desktopId,
            properties: {
              mustExist: true,
              rootAggregateId: quest.goblin
                .getState()
                .get('meta.rootAggregateId'),
              rootAggregatePath: quest.goblin
                .getState()
                .get('meta.rootAggregatePath')
                .valueSeq()
                .toArray()
                .concat(['private', entityId]),
            },
          });
          break;
        case 'removed':
          yield quest.kill([entityId]);
          break;
      }
    }
  };

const loadGraph = (toCreate, desktopId, entity) => (
  entries,
  isVal,
  lvl,
  stopAt,
  skipped,
  peers
) => {
  for (const [v, entry] of entries) {
    if (common.referenceUseArity(entry)) {
      const type = common.getReferenceType(entry);
      if (skipped.includes(type)) {
        continue;
      }
      for (const e of peers[v]) {
        const rId = e.get('id');
        if (e.get('meta.rootAggregatePath') === undefined) {
          console.warn(
            `Entity Load graph cannot load ${rId}, malformed peers...`
          );
          continue;
        }
        const payload = {
          id: rId,
          desktopId,
          entityId: rId,
          entity: e,
          rootAggregateId: e.get('meta.rootAggregateId'),
          rootAggregatePath: e
            .get('meta.rootAggregatePath')
            .valueSeq()
            .toArray(),
          withGraph: {
            level: lvl + 1,
            stopAtLevel: stopAt,
            skipped,
          },
        };
        toCreate.push({id: rId, payload});
      }
      continue;
    } else if (entity.get(v) !== null) {
      const type = common.getReferenceType(entry);
      if (skipped.includes(type)) {
        continue;
      }

      const e = peers[v];
      if (!e) {
        continue;
      }
      const rId = e.get('id');
      // Prevent loop.
      if (rId !== entity.get('id')) {
        const payload = {
          id: rId,
          desktopId,
          entityId: rId,
          entity: e,
          rootAggregateId: e.get('meta.rootAggregateId'),
          rootAggregatePath: e
            .get('meta.rootAggregatePath')
            .valueSeq()
            .toArray(),
          withGraph: {
            level: lvl + 1,
            stopAtLevel: stopAt,
            skipped,
          },
        };
        toCreate.push({id: rId, payload});
      }
    }
  }
};

function builder(config) {
  const {
    name,
    type,
    transient,
    customIndexes,
    orderBy,
    references,
    values,
    properties,
    sums,
    links,
    actions,
    quests,
    onNew,
    afterNew,
    buildSummaries,
    buildViews,
    buildAlerts,
    hydratePeers,
    indexer,
    computer,
    newEntityStatus,
    onArchive,
    onPublish,
    onTrash,
    cacheSize,
    muted,
    disableRipley,
    //enableHistory,
  } = config;

  let indexerMapping = config.indexerMapping;
  let skipPeers = config.skipPeers;

  let goblinName = type;
  if (types.indexOf(type) === -1) {
    types.push(type);
  }
  configs[type] = config;

  if (indexer) {
    if (indexes.indexOf(type) === -1) {
      indexes.push(type);
    }
  }

  if (customIndexes && customIndexes.length > 0) {
    customIndexesByType.push({type, customIndexes});
  }

  if (orderBy) {
    orderIndexesByType.push({type, orderedBy: [orderBy]});
  }

  if (!indexerMapping) {
    indexerMapping = {};
  }

  if (!skipPeers) {
    skipPeers = [];
  }

  indexerMapping['meta/status'] = {
    type: 'keyword',
  };

  if (buildAlerts) {
    indexerMapping['meta/hasErrors'] = {
      type: 'boolean',
    };
    indexerMapping['meta/hasWarnings'] = {
      type: 'boolean',
    };
  }

  if (properties) {
    for (const [prop, info] of Object.entries(properties)) {
      if (info.type && info.type === 'enum') {
        indexerMapping[prop] = {
          type: 'keyword',
        };
      }
      if (info.type && info.type === 'bool') {
        indexerMapping[prop] = {
          type: 'boolean',
        };
      }
      if (info.type && info.type === 'date') {
        indexerMapping[prop] = {
          type: 'date',
        };
      }
    }
  }

  // Clean mapping meta.status -> meta/status
  indexerMapping = Object.entries(indexerMapping).reduce((cleaned, [k, v]) => {
    const cleanKey = k.replace(/\./g, '/');
    if (k.indexOf('.') !== -1) {
      xLog.warn(
        `Entity builder: indexerMapping ${k} as been converted to ${cleanKey}, please fix returned prop name in indexer func`
      );
    }
    cleaned[cleanKey] = v;
    return cleaned;
  }, {});

  indexerMappingsByType.push({type, properties: indexerMapping});

  if (name) {
    goblinName = name;
  }

  const logicState = {};

  const goblinConfig = {
    cacheSize: cacheSize === undefined ? 10 : cacheSize,
    schedulingMode: 'background',
  };

  if (!disableRipley) {
    goblinConfig.ripley = {
      persist: {
        mode: 'all',
      },
    };
  }

  let lastChangedHashes = {};

  const logicHandlers = Object.assign(
    {},
    require('./entity-builder/reducers.js')
  );

  const rehydrateSync = watt(function* (quest, next) {
    yield quest.me.reHydrateSync();
  });

  if (references) {
    const refQuests = buildReferencesQuests(references, rehydrateSync);
    common.registerQuests(goblinName, refQuests);
  }

  if (values) {
    const valQuests = buildValuesQuests(values, rehydrateSync);
    common.registerQuests(goblinName, valQuests);
  }

  if (actions) {
    Object.assign(logicHandlers, actions);
    common.registerEntityActions(goblinName, actions, rehydrateSync);
  }

  if (quests) {
    common.registerQuests(goblinName, quests);
  }

  if (onArchive) {
    Goblin.registerQuest(goblinName, 'on-archive', onArchive);
  }

  if (onPublish) {
    Goblin.registerQuest(goblinName, 'on-publish', onPublish);
  }
  if (onTrash) {
    Goblin.registerQuest(goblinName, 'on-trash', onTrash);
  }

  const rehydrateAndEmit = watt(function* (quest, verb, payload) {
    quest.evt(verb, payload);
    yield quest.me.reHydrateSync();
  });

  const requestHydrate = (
    desktopId,
    entityId,
    rootAggregateId,
    rootAggregatePath
  ) => (err, {resp}) => {
    resp.evt('<hydrate-entity-requested>', {
      desktopId,
      entityId,
      rootAggregateId,
      rootAggregatePath,
      muteChanged: false,
    });
  };

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'create', function* (
    quest,
    id,
    copyId,
    copyEntity,
    copyDeep,
    desktopId,
    loadedBy,
    entity,
    parentEntity,
    rootAggregateId,
    rootAggregatePath,
    mustExist,
    status,
    initialImport,
    _goblinCaller,
    $msg,
    next
  ) {
    if (!desktopId) {
      throw new Error(
        `Entity ${id} cannot be used outside of a desktop, please provide a desktopId`
      );
    }

    if (desktopId.indexOf('system@') === -1) {
      quest.log
        .warn(`unsafe create({id: ${id}, desktopId: ${desktopId}}) detected!

called from:
${$msg.data._goblinCaller}.${$msg.data._goblinCallerQuest}

hint:
use workshop.createEntity({id,desktopId,createFor,properties})
this ensure system feed during creation. `);
    }

    if (!parentEntity) {
      parentEntity = null;
    }

    if (!rootAggregateId) {
      rootAggregateId = id;
    }

    if (!rootAggregatePath) {
      rootAggregatePath = [];
    } else {
      if (rootAggregatePath.toArray) {
        rootAggregatePath = rootAggregatePath.valueSeq().toArray();
      }
    }

    if (status) {
      if (!entityFlowValidStatus.includes(status)) {
        quest.log.warn(
          `Entity-builder: creating ${id} with bad status ${status}, check code!`
        );
        status = undefined;
      }
    }

    if (entity) {
      const entityType = entity.get('meta.type');
      if (!entityType) {
        throw new Error('Bad entity provided to entity service');
      }
      if (entityType !== type) {
        throw new Error('Bad entity type provided to entity service');
      }
    }

    quest.goblin.setX('_goblinCaller', _goblinCaller);
    quest.goblin.setX('desktopId', desktopId);
    quest.goblin.setX('loadedBy', loadedBy);
    quest.goblin.setX('rootAggregateId', rootAggregateId);
    quest.goblin.setX('rootAggregatePath', rootAggregatePath);
    quest.goblin.setX('valSubs', {});
    quest.goblin.setX('refSubs', {});
    quest.goblin.getX('graphSubs', {});
    quest.goblin.setX('createParams', {
      copyId,
      copyEntity,
      copyDeep,
      desktopId,
      loadedBy,
      entity,
      parentEntity,
      rootAggregateId,
      rootAggregatePath,
      mustExist,
      status,
      initialImport,
    });

    const notifier = (q, muteChanged) => {
      if (!muted && !muteChanged) {
        q.log.verb(`${q.goblin.id} changed`);
        q.evt('<entity-changed>', {id: q.goblin.id});
      }
    };

    quest.goblin.setX('notifyChanged', notifier); //_.debounce(notifier, 500));

    let isNew = false;
    let isMissing = false;
    let isTrashed = false;
    const r = quest.getStorage(entityStorage);
    // Copy case init:
    if (copyId) {
      quest.log.dbg('COPY ENTITY', id);
      if (copyEntity) {
        entity = copyEntity;
      } else {
        let copyType = copyId.split('@', 1)[0];
        if (copyType !== type) {
          quest.log.warn(
            `Mismatch between copyType ${copyType} (in) and type "${type}" (out) ! Hope you know what you are doing...`
          );
        }
        entity = yield r.get({
          table: copyType,
          documentId: copyId,
          privateState: true,
        });
        if (!entity) {
          throw new Error(`Cannot copy entity ${copyId} not found !`);
        }
      }
      entity = new Goblin.Shredder(entity);
      entity = entity.set('id', id);

      //complete entity from schema
      entity = completesEntityWithDefaultValues(goblinName, entity);
      const makeDeepCopy = require('./entity-builder/makeDeepCopy.js');

      const storeFunc = watt(function* (newEntity) {
        yield r.set({
          table: newEntity.get('id').split('@', 1)[0],
          documents: newEntity.toJS(),
        });

        if (rootAggregateId !== newEntity.get('id')) {
          const rootType = rootAggregateId.split('@', 1)[0];
          yield r.setIn({
            table: rootType,
            documentId: rootAggregateId,
            path: newEntity.get('meta.rootAggregatePath').valueSeq().toArray(),
            value: newEntity.toJS(),
          });
        }
      });

      const copyInitialStatus =
        status || newEntityStatus || entity.get('meta.status');

      if (copyDeep) {
        entity = makeDeepCopy(
          entity,
          id,
          copyInitialStatus,
          rootAggregateId,
          rootAggregatePath,
          parentEntity,
          storeFunc
        );
      } else {
        //we don't keep value (not deep copy)
        //reset cached value
        entity = entity.set('private', {});
        if (values) {
          for (const [path, def] of Object.entries(values)) {
            if (common.referenceUseArity(def)) {
              entity = entity.set(path, []);
            } else {
              entity = entity.set(path, null);
            }
          }
        }

        entity = makeDeepCopy(
          entity,
          id,
          copyInitialStatus,
          rootAggregateId,
          rootAggregatePath,
          parentEntity,
          storeFunc
        );
      }
    }

    if (!entity) {
      // If we create the rootAggregate
      if (rootAggregateId === id) {
        entity = yield r.get({
          table: type,
          documentId: id,
          privateState: true,
        });
      } else {
        const rootType = rootAggregateId.split('@', 1)[0];
        entity = yield r.getIn({
          table: rootType,
          documentId: rootAggregateId,
          path: rootAggregatePath,
        });
      }
    }

    if (entity) {
      quest.log.info('LOAD ENTITY', id);
      entity = new Goblin.Shredder(entity);
      // ENSURE REFS/VALUES PATH EXIST
      for (const path in references) {
        const ref = references[path];
        if (common.referenceUseArity(ref)) {
          if (!entity.get(path)) {
            entity = entity.set(path, []);
          }
        } else {
          if (!entity.get(path)) {
            entity = entity.set(path, null);
          }
        }
      }

      for (const path in values) {
        const ref = values[path];
        if (common.referenceUseArity(ref)) {
          if (!entity.get(path)) {
            entity = entity.set(path, []);
          }
        } else {
          if (!entity.get(path)) {
            entity = entity.set(path, null);
          }
        }
      }

      // Init private data.
      if (!entity.get('private')) {
        entity = entity.set('private', {});
      }

      if (values) {
        // Set initial private values.
        for (const val in values) {
          if (!entity.get(`private.${val}`)) {
            entity = entity.set(`private.${val}`, {});
          }
        }
      }

      if (computer && sums) {
        if (!entity.get('sums')) {
          const initialSums = {};
          for (const [sum, info] of Object.entries(sums)) {
            initialSums[sum] = info.defaultValue;
          }
          entity = entity.set('sums', initialSums);
        }
      }

      entity = entityMeta.set(entity, type, references, values, links);

      if (initialImport === true) {
        quest.do();
        yield quest.me.replace({entity});
        return quest.goblin.id;
      }
    }

    if (!entity) {
      quest.log.info('NEW ENTITY ', id);
      isNew = true;
      if (mustExist) {
        //TRY TO HANDLE SPECIAL CASE WHEN PROVIDED ENTITY IS EMPTY
        //OR MISSING AND 'MUST' EXIST
        //TRASHED ENTITIES AND MISSING ENTITIES CAN BE HANDLED
        //WITH DEDICATED GARBAGE OR REVIVE PROCESS
        if (rootAggregateId === id) {
          //MISSING CASE
          //Entity is no more in storage cache
          quest.log.err(`Entity not found ${id}`);
          isMissing = true;
        } else {
          //TRASHED CASE
          //Entity is no more aggregated by value in parent
          quest.log.err(`Aggregate not found ${id} in ${rootAggregatePath}`);
          //Try to read the last entity state
          entity = yield r.get({
            table: type,
            documentId: id,
            privateState: true,
          });
          if (entity) {
            isTrashed = true;
            isNew = false;
          } else {
            isMissing = true;
          }
        }
      }
      try {
        if (onNew) {
          // We support the same goblin quest feature:
          // auto parameter->value mapping

          const params = xUtils.reflect
            .funcParams(onNew)
            .filter((param) => !/^(quest|next)$/.test(param));

          const _onNew = (q, m, n) => {
            const args = params.map((p) => {
              return m.get(p);
            });

            /* Pass the whole Xcraft message if asked by the quest. */
            if (!m.get('$msg')) {
              const idx = params.indexOf('$msg');
              if (idx > -1) {
                args[idx] = m;
              }
            }

            args.unshift(q);
            if (n) {
              args.push(n);
            }

            return onNew(...args);
          };

          if (common.isGenerator(onNew)) {
            entity = yield* _onNew(quest, $msg, next);
          } else {
            entity = _onNew(quest, $msg);
          }
        }
      } catch (err) {
        throw new Error(err);
      }

      entity = new Goblin.Shredder(entity);

      let initialStatus = yield getInitialStatus(
        quest,
        status,
        newEntityStatus,
        parentEntity
      );

      // Special cases.
      if (isMissing) {
        initialStatus = 'missing';
      }
      if (isTrashed) {
        initialStatus = 'trashed';
      }

      // Set meta.
      entity = entityMeta.set(
        entity,
        type,
        references,
        values,
        links,
        parentEntity,
        rootAggregateId,
        rootAggregatePath,
        initialStatus
      );

      // Complete entity
      entity = completesEntityWithDefaultValues(goblinName, entity);

      if (isNew) {
        // Check new entity, just after onNew.
        const ok = yield* checkNewEntity(quest, 'create', goblinName, entity);
        if (!ok) {
          //- throw new Error(`Fatal error, inconsistant entity id=${entity.id}`);
        }
      }

      const document = entity.toJS();
      r.set(
        {
          table: type,
          documents: document,
        },
        next.parallel()
      );

      if (rootAggregateId !== entity.get('id')) {
        const rootType = rootAggregateId.split('@', 1)[0];
        r.setIn(
          {
            table: rootType,
            documentId: rootAggregateId,
            path: rootAggregatePath,
            value: document,
          },
          next.parallel()
        );
      }
    }

    quest.goblin.setX('isNew', isNew);
    if (isNew) {
      quest.defer(() => quest.goblin.setX('isNew', false));
    }
    quest.do({entity});
    yield next.sync();
    common.createWaitLoader(quest);

    // Backup 'at load' state.
    const freshEntity = quest.goblin.getState();
    // quest.dispatch('backup', {entity: freshEntity});
    quest.goblin.setX('oldStateHash', freshEntity.hashCode());
    yield afterCreate(quest, next);
    return quest.goblin.id;
  });

  /******************************************************************************/

  const afterCreate = watt(function* (quest, next) {
    const entity = quest.goblin.getState();
    const valSubs = quest.goblin.getX('valSubs');
    const refSubs = quest.goblin.getX('refSubs');
    const isNew = quest.goblin.getX('isNew');
    const entityId = entity.get('id');
    const rootAggregateId = entity.get('meta.rootAggregateId');
    const rootAggregatePath = entity
      .get('meta.rootAggregatePath')
      .valueSeq()
      .toArray();
    const hydrator = requestHydrate(
      quest.getSystemDesktop(),
      entityId,
      rootAggregateId,
      rootAggregatePath
    );

    if (entity.get('meta.status') !== 'archived') {
      // SUBSCRIBE TO REF CHANGES
      for (const path in references) {
        const ref = references[path];
        if (!entity.has(path)) {
          throw new Error(
            `Your reference ${path} not match with your ${entity.get(
              'meta.type'
            )} entity props`
          );
        }

        if (common.referenceUseArity(ref)) {
          for (const rId of entity.get(path).values()) {
            if (!refSubs[rId]) {
              refSubs[rId] = [];
            }
            // RE-HYDRATE
            refSubs[rId].push(
              quest.sub.local(`*::${rId}.<entity-changed>`, hydrator)
            );
          }
        } else {
          // Entity case
          const rId = entity.get(path);
          if (rId && rId.length) {
            if (!refSubs[rId]) {
              refSubs[rId] = [];
            }

            // RE-HYDRATE
            refSubs[rId].push(
              quest.sub.local(`*::${rId}.<entity-changed>`, hydrator)
            );
          }
        }
      }
      quest.goblin.setX('refSubs', refSubs);

      // SUBSCRIBE TO VAL CHANGES
      for (const path in values) {
        const val = values[path];
        if (!entity.has(path)) {
          throw new Error(
            `Your value ${path} not match with your ${entity.get(
              'meta.type'
            )} entity props`
          );
        }

        if (common.referenceUseArity(val)) {
          for (const rId of entity.get(path).values()) {
            if (!valSubs[rId]) {
              valSubs[rId] = [];
            }
            // RE-HYDRATE
            valSubs[rId].push(
              quest.sub.local(`*::${rId}.<entity-changed>`, hydrator)
            );
          }
        } else {
          // Entity case
          const rId = entity.get(path);
          if (rId && rId.length) {
            if (!valSubs[rId]) {
              valSubs[rId] = [];
            }

            // RE-HYDRATE
            valSubs[rId].push(
              quest.sub.local(`*::${rId}.<entity-changed>`, hydrator)
            );
          }
        }
      }
      quest.goblin.setX('valSubs', valSubs);
    }

    if (isNew) {
      if (afterNew) {
        const desktopId = quest.getDesktop();
        if (common.isGenerator(afterNew)) {
          yield* afterNew(quest, desktopId, entity, next);
        } else {
          afterNew(quest, desktopId, entity);
        }
      }
      yield quest.me.hydrate();
      yield quest.me.persist();
    }
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);
  Goblin.registerQuest(goblinName, 'get-entities', common.getEntitiesQuest);
  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);
  // Load graph
  Goblin.registerQuest(goblinName, 'load-graph', function* (
    quest,
    loadedBy,
    level,
    stopAtLevel,
    skipped,
    desktopId,
    next
  ) {
    if (!desktopId) {
      throw new Error('desktopId required!');
    }

    if (!loadedBy) {
      throw new Error('Cannot load graph without loadedBy params');
    }

    if (loadedBy.indexOf('@') === -1) {
      throw new Error(`Cannot load graph from a singleton: ${loadedBy}`);
    }

    if (!level) {
      throw new Error('Cannot load graph without level params');
    }
    if (!stopAtLevel) {
      throw new Error('Cannot load graph without stopAtLevel params');
    }
    if (!skipped) {
      throw new Error('Cannot load graph without skipped params');
    }

    const entity = quest.goblin.getState();
    const toCreate = [];
    if (level <= stopAtLevel) {
      //SUBSCRIBE TO COLLECTION CHANGED
      const graphSubscribers = quest.goblin.getX('graphSubs');
      if (!graphSubscribers[desktopId]) {
        graphSubscribers[desktopId] = {};
        graphSubscribers[desktopId].startUnsub = quest.sub(
          `*::${quest.goblin.id}.<collection-changed>`,
          handleCollectionChanged(quest, desktopId, skipped)
        );
        graphSubscribers[desktopId].stopUnsub = quest.sub(
          `*::${loadedBy}.<unsubscribe-requested>`,
          () => {
            //UNSUBSCRIBE WHEN THE LOADER ASK TO
            graphSubscribers[desktopId].startUnsub();
            graphSubscribers[desktopId].stopUnsub();
            delete graphSubscribers[desktopId];
          }
        );
      }

      const peers = yield buildPeers(quest, entity, []);
      if (entity.get('meta.references')) {
        loadGraph(toCreate, desktopId, entity)(
          entity.get('meta.references').entries(),
          false,
          level,
          stopAtLevel,
          skipped,
          peers
        );
      }

      if (entity.get('meta.values')) {
        loadGraph(toCreate, desktopId, entity)(
          entity.get('meta.values').entries(),
          true,
          level,
          stopAtLevel,
          skipped,
          peers
        );
      }

      if (toCreate.length) {
        const wAPI = quest.getAPI('workshop');
        for (const c of toCreate) {
          wAPI.createEntity(
            {
              id: c.id,
              desktopId,
              createFor: loadedBy,
              properties: c.payload,
            },
            next.parallel()
          );
        }
        yield next.sync();
        for (const c of toCreate) {
          const api = quest.getAPI(c.id);
          api.loadGraph(
            {
              loadedBy,
              level: level + 1,
              stopAtLevel: stopAtLevel,
              skipped,
              desktopId,
            },
            next.parallel()
          );
        }
        yield next.sync();
      }
    }
  });

  /******************************************************************************/

  // Notify changed
  // emit an event if the state is new
  Goblin.registerQuest(goblinName, 'notify-changed', function (
    quest,
    muteChanged
  ) {
    const notifyChanged = quest.goblin.getX('notifyChanged');
    const oldStateHash = quest.goblin.getX('oldStateHash');
    if (!notifyChanged) {
      quest.log.warn('Entity is unloaded while notify-changed is called...');
      return false;
    }

    const currentHash = quest.goblin.getState().hashCode();
    if (currentHash === oldStateHash) {
      return false;
    }

    quest.goblin.setX('oldStateHash', currentHash);
    notifyChanged(quest, muteChanged);
    return true;
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'hydrate', function* (
    quest,
    muteChanged,
    options,
    force,
    noHydratePeers,
    next
  ) {
    let entity = quest.goblin.getState();
    try {
      //default behavior
      let needPeers = true;
      let doBuildSummaries = !!buildSummaries;
      let doCompute = !!computer;
      let doIndex = !!indexer;
      let doBuildViews = !!buildViews;

      //if options is passed, change defaults
      if (options) {
        if (options.compute !== undefined) {
          doCompute = options.compute;
        }
        if (options.buildSummaries !== undefined) {
          doBuildSummaries = options.buildSummaries;
        }
        if (options.buildViews !== undefined) {
          doBuildViews = options.buildViews;
        }
        if (options.index !== undefined) {
          doIndex = options.index;
        }
        if (!doIndex && !doBuildSummaries && !doCompute && !doBuildViews) {
          needPeers = false;
        }
      }

      const lastHydrate = quest.goblin.getX('lastHydrate');
      let peers = null;

      if (needPeers) {
        peers = yield buildPeers(quest, entity, skipPeers);
      }

      if (lastHydrate) {
        const peersIsEqual = (oldPeers, peers) => {
          if (!oldPeers || !peers) {
            return oldPeers === peers;
          }
          for (const key of Object.keys(peers)) {
            if (Array.isArray(peers[key])) {
              for (const valKey of Object.keys(peers[key])) {
                if (oldPeers[key][valKey].equals(peers[key][valKey])) {
                  continue;
                } else {
                  return false;
                }
              }
            } else {
              if (!oldPeers[key] || !peers[key]) {
                if (oldPeers[key] === peers[key]) {
                  continue;
                } else {
                  return false;
                }
              } else if (oldPeers[key].equals(peers[key])) {
                continue;
              } else {
                return false;
              }
            }
          }
          return true;
        };

        const entityIsEqual = (oldEntity, entity) => {
          if (oldEntity.get('meta.status') !== entity.get('meta.status')) {
            return false;
          }
          const oldWithoutMeta = oldEntity.del('meta');
          const newWithoutMeta = entity.del('meta');
          return oldWithoutMeta.equals(newWithoutMeta);
        };

        if (
          !force &&
          entityIsEqual(lastHydrate.entity, entity) &&
          peersIsEqual(lastHydrate.peers, peers)
        ) {
          quest.log.info(`skip hydrate ${entity.get('id')}`);
          quest.evt('hydrated');
          return;
        }
      }
      quest.log.info(`hydrate ${entity.get('id')}`);
      quest.goblin.setX('lastHydrate', {entity, peers});

      try {
        if (computer && sums && doCompute) {
          yield quest.me.compute({entity, peers});
        }

        try {
          if (buildSummaries && doBuildSummaries) {
            entity = quest.goblin.getState();
            yield quest.me.buildSummaries({entity, peers});
          }

          if (buildViews && doBuildViews) {
            entity = quest.goblin.getState();
            yield quest.me.buildViews({entity, peers});
          }

          if (buildAlerts) {
            entity = quest.goblin.getState();
            yield quest.me.buildAlerts({entity, peers});
          }

          entity = quest.goblin.getState();
          try {
            if (indexer && doIndex) {
              yield quest.me.index({entity, peers});
            }
          } catch (ex) {
            if (!ex._rethrow) {
              quest.fail(
                `Erreur lors de l'hydratation`,
                `problème dans l'indexeur`,
                `voir message d'ex.`,
                ex.stack || ex.message || ex
              );
              ex._rethrow = true;
            }
            throw ex;
          }

          //notify freshness, usefull for entity-view updating
          quest.evt('<entity-refreshed>');
          const changed = yield quest.me.notifyChanged({muteChanged});
          const isNew = quest.goblin.getX('isNew');
          if (changed && !isNew) {
            if (entity.get('meta.rootAggregateId') !== quest.goblin.id) {
              const parentId = entity.get('meta.parentEntity');
              quest.evt('<update-aggregate-requested>', {
                parentId,
                desktopId: quest.getSystemDesktop(),
                entityId: entity.get('id'),
                requestedBy: quest.goblin.getX('_goblinCaller'),
                muteChanged,
              });
            }

            if (!noHydratePeers && peers && hydratePeers) {
              hydratePeers
                .filter((peerKey) => !!peers[peerKey])
                .map((peerKey) => peers[peerKey])
                .forEach((peer) => {
                  const entities = Array.isArray(peer) ? peer : [peer];
                  entities.forEach((entity) => {
                    if (!entity.get('meta.rootAggregatePath')) {
                      console.warn(
                        `Malformed peers found in entity: ${entity.get('id')}`
                      );
                      return;
                    }
                    quest.evt('<hydrate-entity-requested>', {
                      peerHydrate: true,
                      desktopId: quest.getSystemDesktop(),
                      entityId: entity.get('id'),
                      rootAggregateId: entity.get('meta.rootAggregateId'),
                      rootAggregatePath: entity
                        .get('meta.rootAggregatePath')
                        .valueSeq()
                        .toArray(),
                      muteChanged: true,
                      muteHydrated: true,
                      requestedBy: quest.goblin.getX('_goblinCaller'),
                    });
                  });
                });
            }
          }
        } catch (ex) {
          if (!ex._rethrow) {
            quest.fail(
              `Erreur lors de l'hydratation`,
              `problème dans les summaries`,
              `voir message d'ex.`,
              ex.stack || ex.message || ex
            );
            ex._rethrow = true;
          }
          throw ex;
        }
      } catch (ex) {
        if (!ex._rethrow) {
          quest.fail(
            `Erreur lors de l'hydratation`,
            `problème dans le calculateur`,
            `voir message d'ex.`,
            ex.stack || ex.message || ex
          );
          ex._rethrow = true;
        }
        throw ex;
      }
    } catch (ex) {
      if (!ex._rethrow) {
        quest.fail(
          `Erreur lors de l'hydratation`,
          `problème de construction du graph`,
          `voir avec Sam`,
          ex.stack || ex.message || ex
        );
      }
      delete ex._rethrow;
      throw ex;
    }
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'change', function* (quest, path, newValue) {
    const entity = quest.goblin.getState();
    const from = `${quest.questName} (${quest.calledFrom})`;
    // Avoid change archives.
    if (entity.get('meta.status') === 'archived') {
      const message = `${goblinName}: Trying to mutate an archived document ${quest.goblin.id}`;
      yield* addEntityNotification(quest, message, true);
      return;
    }

    //? const propName = path.split('.', 1)[0];
    const propName = path.startsWith('.') ? path.substring(1) : path;

    // Prevent inserting undefined in storage.
    if (newValue === undefined) {
      const fix = {
        from,
        entityName: goblinName,
        entityId: quest.goblin.id,
        path: propName,
        pathType: null,
        value: 'undefined',
        valueType: 'undefined',
        message: 'Try to change with "undefined"',
      };
      yield* addFixNotification(quest, fix);
      return;
    }
    const oldHash = quest.goblin.getState().hashCode();
    let isProperty = true;
    let entityIds = [];
    if (references && references[propName]) {
      isProperty = false;
      entityIds = yield quest.me.clearRef({path: propName});
    }
    if (values && values[propName]) {
      isProperty = false;
      entityIds = yield quest.me.clearVal({path: propName});
    }
    //cleanup for active feed
    if (!isProperty && entityIds.length > 0) {
      const feeds = yield quest.warehouse.getBranchSubscriptions({
        branch: quest.goblin.id,
        filters: ['system'],
      });

      for (const _ of feeds) {
        yield quest.kill([entityIds]);
      }
    }

    // Check properties.
    if (isProperty) {
      if (properties) {
        const propInfo = properties[propName];
        const ok = yield* checkProperty(
          quest,
          from,
          goblinName,
          propName,
          propInfo,
          newValue
        );
        if (!ok) {
          return;
        }
      } else {
        const fix = {
          from,
          entityName: goblinName,
          entityId: quest.goblin.id,
          path: propName,
          value: newValue,
          valueType: typeof newValue,
          message: 'No properties defined for entity',
        };
        yield* addFixNotification(quest, fix);
        return;
      }
    }

    quest.do();
    if (oldHash === quest.goblin.getState().hashCode()) {
      return;
    }

    yield quest.me.reHydrateSync();
    quest.evt('<entity-property-changed>', {path, newValue});
  });

  /******************************************************************************/

  const _apply = watt(function* (
    quest,
    patch,
    muteChanged,
    muteHydrated,
    force,
    noHydratePeers
  ) {
    const entity = quest.goblin.getState();
    const from = `${quest.questName} (${quest.calledFrom})`;
    // Avoid change archives.
    if (!force && entity.get('meta.status') === 'archived') {
      const message = `${goblinName}: Trying to mutate an archived document ${quest.goblin.id}`;
      yield* addEntityNotification(quest, message, true);
      return;
    }

    // Check properties.
    if (properties) {
      let success = true;
      for (const [propName, newValue] of Object.entries(patch)) {
        if (references && references[propName]) {
          continue;
        }
        if (values && values[propName]) {
          continue;
        }

        const propInfo = properties[propName];
        const ok = yield* checkProperty(
          quest,
          from,
          goblinName,
          propName,
          propInfo,
          newValue
        );
        if (!ok) {
          success = false;
          break;
        }
      }
      if (!success) {
        return;
      }
    } else {
      const fix = {
        from,
        entityName: goblinName,
        entityId: quest.goblin.id,
        message: 'No properties defined for entity',
      };
      yield* addFixNotification(quest, fix);
      return;
    }

    const oldHash = quest.goblin.getState().hashCode();
    quest.do();
    if (!force && oldHash === quest.goblin.getState().hashCode()) {
      return;
    }

    yield quest.me.reHydrateSync({muteChanged, muteHydrated, noHydratePeers});
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'apply', function* (
    quest,
    patch,
    muteChanged,
    muteHydrated,
    force,
    noHydratePeers
  ) {
    return yield _apply(
      quest,
      patch,
      muteChanged,
      muteHydrated,
      force,
      noHydratePeers
    );
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'merge', function* (
    quest,
    patch,
    muteChanged,
    muteHydrated,
    force,
    noHydratePeers
  ) {
    return yield _apply(
      quest,
      patch,
      muteChanged,
      muteHydrated,
      force,
      noHydratePeers
    );
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'update-aggregate', function* (
    quest,
    entityId,
    desktopId,
    muteChanged
  ) {
    const state = quest.goblin.getState();
    let entity;
    try {
      const valueAPI = yield quest.create(entityId, {
        id: entityId,
        desktopId: quest.getSystemDesktop(),
      });
      entity = yield valueAPI.get();
      const fullPath = entity
        .get('meta.rootAggregatePath')
        .valueSeq()
        .toArray();
      const entityPath = fullPath.slice(-3);
      const referencePath = fullPath[fullPath.length - 2];
      if (!state.get(referencePath).includes(entityId)) {
        return;
      }
      const currentState = state.get(entityPath);
      if (currentState.equals(entity)) {
        return;
      }
      quest.do({entity, entityPath});
      yield quest.me.reHydrateSync({muteChanged});
    } finally {
      yield quest.kill([entityId], quest.goblin.id);
    }
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 're-hydrate-async', function (
    quest,
    muteChanged,
    muteHydrated,
    options
  ) {
    const entity = quest.goblin.getState();
    quest.evt('<hydrate-entity-requested>', {
      desktopId: quest.getSystemDesktop(),
      entityId: entity.get('id'),
      rootAggregateId: entity.get('meta.rootAggregateId'),
      rootAggregatePath: entity
        .get('meta.rootAggregatePath')
        .valueSeq()
        .toArray(),
      muteChanged,
      muteHydrated,
      options,
    });
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 're-hydrate-sync', function* (
    quest,
    muteChanged,
    muteHydrated,
    noHydratePeers,
    options
  ) {
    yield quest.me.hydrate({muteChanged, options, noHydratePeers});
    yield quest.me.persist();
    if (!muteHydrated) {
      const hydratedEntity = quest.goblin.getState();
      const type = hydratedEntity.get('meta.type');
      quest.evt(`<${type}-hydrated>`, {
        entityId: hydratedEntity.get('id'),
        desktopId: quest.getSystemDesktop(),
      });
    }
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'rebuild', function* (quest) {
    //rebuild values
    const r = quest.getStorage(entityStorage);
    const toCheck = {};
    const entity = quest.goblin.getState();
    const values = entity.get('meta.values');
    const currentRootPath = quest.goblin.getX('rootAggregatePath');

    if (values) {
      for (const path of values.keys()) {
        fetchValues(quest, toCheck, entity, values, path, true);
      }

      for (const [key, values] of Object.entries(toCheck)) {
        if (values) {
          for (let entity of Object.values(values)) {
            const entityId = entity.get('id');
            const type = entity.get('meta.type');
            const rootId = entity.get('meta.rootAggregateId');
            const rootPath = entity.get('meta.rootAggregatePath');
            if (!entityId) {
              quest.log.dbg('aieaiaiea');
              continue;
            }

            if (!type) {
              quest.log.dbg('aieaiaiea');
              continue;
            }

            if (!rootId) {
              entity = entity.set('meta.rootAggregateId', quest.goblin.id);
            }
            if (!rootPath) {
              entity = entity.set(
                'meta.rootAggregatePath',
                currentRootPath.concat(['private', key, entityId])
              );
            }

            const existing = yield r.get({
              table: type,
              documentId: entityId,
              privateState: true,
            });
            if (!existing) {
              yield r.set({
                table: type,
                documents: entity.toJS(),
              });
            }
          }
        }
      }
    }
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'delete-aggregate', function* (
    quest,
    entity
  ) {
    quest.do();
    const subs = quest.goblin.getX('valSubs');
    subs[entity.id]();
    yield quest.me.reHydrateSync();
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'replace', function* (quest, entity) {
    quest.do({entity});
    if (entity.get('meta.index')) {
      yield quest.me.setIndex({
        docId: entity.get('id'),
        doc: entity.get('meta.index'),
      });
    }
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'get', function (quest, path) {
    if (!path) {
      return quest.goblin.getState();
    } else {
      return quest.goblin.getState().get(path);
    }
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'copy-collection-by-ref', function* (
    quest,
    path,
    entityIds,
    next
  ) {
    quest.do();
    const refSubs = quest.goblin.getX('refSubs');
    for (const entityId of entityIds) {
      //Add a ref for us too
      quest.create(
        entityId,
        {
          id: entityId,
          desktopId: quest.getSystemDesktop(),
          loadedBy: quest.goblin.id,
        },
        next.parallel()
      );

      if (!refSubs[entityId]) {
        refSubs[entityId] = [];
      }

      const sourceEntity = quest.goblin.getState();

      const sourceId = sourceEntity.get('id');
      const rootAggregateId = sourceEntity.get('meta.rootAggregateId');
      const rootAggregatePath = sourceEntity
        .get('meta.rootAggregatePath')
        .valueSeq()
        .toArray();
      const hydrator = requestHydrate(
        quest.getSystemDesktop(),
        sourceId,
        rootAggregateId,
        rootAggregatePath
      );
      refSubs[entityId].push(
        quest.sub.local(`*::${entityId}.<entity-changed>`, hydrator)
      );

      quest.goblin.setX('refSubs', refSubs);
      quest.evt('<collection-changed>', {eventType: 'added', entityId, path});
    }
    yield next.sync();
    yield quest.me.reHydrateSync();
    yield quest.kill([entityIds], quest.goblin.id);
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'add-ref', function* (
    quest,
    path,
    entityId,
    remote,
    beforeId
  ) {
    const entity = quest.goblin.getState();
    //avoid change archives
    if (entity.get('meta.status') === 'archived') {
      quest.log.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }
    const existing = quest.goblin.getState().get(path).includes(entityId);
    if (existing) {
      return;
    }
    quest.do();
    const refSubs = quest.goblin.getX('refSubs');

    //Add a ref for each feeds
    const feeds = yield quest.warehouse.getBranchSubscriptions({
      branch: quest.goblin.id,
      filters: ['system'],
    });

    const wAPI = quest.getAPI('workshop');
    for (const desktopId of feeds) {
      yield wAPI.createEntity({
        id: entityId,
        createFor: quest.goblin.id,
        desktopId,
        properties: {loadedBy: quest.goblin.id},
      });
    }

    if (!refSubs[entityId]) {
      refSubs[entityId] = [];
    }

    const id = entity.get('id');
    const rootAggregateId = entity.get('meta.rootAggregateId');
    const rootAggregatePath = entity
      .get('meta.rootAggregatePath')
      .valueSeq()
      .toArray();
    const hydrator = requestHydrate(
      quest.getSystemDesktop(),
      id,
      rootAggregateId,
      rootAggregatePath
    );
    refSubs[entityId].push(
      quest.sub.local(`*::${entityId}.<entity-changed>`, hydrator)
    );

    quest.goblin.setX('refSubs', refSubs);
    quest.evt('<collection-changed>', {
      eventType: 'added',
      entityId,
      beforeId,
      path,
    });

    if (!remote) {
      yield quest.me.reHydrateSync();
    }
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'add-new-val', function* (
    quest,
    path,
    type,
    payload,
    parentEntity,
    beforeId
  ) {
    const entity = quest.goblin.getState();
    //avoid change archives
    if (entity.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const agg = common.getAggregationInfo(quest);
    const newEntityId = (payload && payload.id) || `${type}@${quest.uuidV4()}`;
    try {
      const newEntity = yield quest.createEntity(
        newEntityId,
        Object.assign(
          {
            parentEntity,
            status: quest.goblin.getState().get('meta.status'),
            rootAggregateId: agg.rootAggregateId,
            rootAggregatePath: agg.rootAggregatePath.concat([
              'private',
              path,
              newEntityId,
            ]),
            loadedBy: quest.goblin.id,
          },
          payload
        )
      );
      const newEntityState = yield newEntity.get();
      yield quest.me.addVal({path, entity: newEntityState, beforeId});
    } finally {
      yield quest.kill([newEntityId], quest.goblin.id);
    }

    return newEntityId;
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'copy-collection-by-value', function* (
    quest,
    path,
    entityIds,
    entities,
    deepCopy,
    next
  ) {
    const entity = quest.goblin.getState();
    //avoid change archives
    if (entity.get('meta.status') === 'archived') {
      quest.log.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const agg = common.getAggregationInfo(quest);
    if (entityIds.size === 0 || !entityIds.get(0)) {
      return;
    }
    const type = entityIds.get(0).split('@', 1)[0];
    const copyMapping = {};
    for (const entityId of entityIds) {
      const toCopy = entities.get(entityId);
      const newEntityId = `${type}@${quest.uuidV4()}`;
      const payload = {
        id: newEntityId,
        copyId: entityId,
        copyEntity: toCopy,
        copyDeep: deepCopy,
        desktopId: quest.getSystemDesktop(),
        loadedBy: quest.goblin.id,
        parentEntity: quest.goblin.id,
        rootAggregateId: agg.rootAggregateId,
        rootAggregatePath: agg.rootAggregatePath.concat([
          'private',
          path,
          newEntityId,
        ]),
      };

      copyMapping[newEntityId] = entityId;
      quest.create(newEntityId, payload, next.parallel());
    }

    const newEntityAPIs = yield next.sync();
    for (const newEntityAPI of newEntityAPIs) {
      newEntityAPI.get({}, next.parallel());
    }

    let newEntities = yield next.sync();
    newEntities = newEntities.reduce((state, entity) => {
      state[entity.get('id')] = entity.toJS();
      return state;
    }, {});

    quest.do({
      entityIds: Object.keys(newEntities),
      entities: newEntities,
    });

    const entityId = entity.get('id');
    const rootAggregateId = entity.get('meta.rootAggregateId');
    const rootAggregatePath = entity
      .get('meta.rootAggregatePath')
      .valueSeq()
      .toArray();
    const hydrator = requestHydrate(
      quest.getSystemDesktop(),
      entityId,
      rootAggregateId,
      rootAggregatePath
    );
    const createdEntityIds = newEntityAPIs.map((api) => api.id);
    for (const newEntityId of createdEntityIds) {
      const valSubs = quest.goblin.getX('valSubs');
      if (!valSubs[newEntityId]) {
        valSubs[newEntityId] = [];
      }

      valSubs[newEntityId].push(
        quest.sub.local(`*::${newEntityId}.<entity-changed>`, hydrator)
      );

      quest.goblin.setX('valSubs', valSubs);
      quest.evt('<collection-changed>', {
        eventType: 'added',
        entityId: newEntityId,
        beforeId: null,
        path,
      });
    }

    yield quest.me.reHydrateSync();
    yield quest.kill([createdEntityIds], quest.goblin.id);
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'add-copy-val', function* (
    quest,
    path,
    type,
    entityId,
    entity,
    deepCopy,
    beforeId
  ) {
    //Prevent reference modifications via event-emitter
    const toCopy = new Goblin.Shredder(entity);
    if (!entityId) {
      throw new Error('Cannot add a copy value: entityId is required');
    }

    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const agg = common.getAggregationInfo(quest);
    const newEntityId = `${type}@${quest.uuidV4()}`;
    const payload = {
      id: newEntityId,
      copyId: entityId,
      copyEntity: toCopy,
      copyDeep: deepCopy,
      desktopId: quest.getSystemDesktop(),
      loadedBy: quest.goblin.id,
      parentEntity: quest.goblin.id,
      rootAggregateId: agg.rootAggregateId,
      rootAggregatePath: agg.rootAggregatePath.concat([
        'private',
        path,
        newEntityId,
      ]),
    };

    const newEntityAPI = yield quest.create(newEntityId, payload);

    const newEntity = yield newEntityAPI.get();

    yield quest.me.addVal({path, entity: newEntity, beforeId});
    yield quest.kill([newEntityId], quest.goblin.id);
    return newEntityId;
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'add-copy-ref', function* (
    quest,
    path,
    type,
    entityId,
    entity,
    deepCopy,
    beforeId
  ) {
    //Prevent reference modifications via event-emitter
    const toCopy = new Goblin.Shredder(entity);
    if (!entityId) {
      throw new Error('Cannot add a copy ref: entityId is required');
    }

    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const agg = common.getAggregationInfo(quest);
    const newEntityId = `${type}@${quest.uuidV4()}`;
    const payload = {
      id: newEntityId,
      copyId: entityId,
      copyEntity: toCopy,
      copyDeep: deepCopy,
      desktopId: quest.getSystemDesktop(),
      loadedBy: quest.goblin.id,
      parentEntity: null,
      rootAggregateId: agg.rootAggregateId,
      rootAggregatePath: agg.rootAggregatePath.concat([
        'private',
        path,
        newEntityId,
      ]),
    };

    //Force copy to be a root

    payload.rootAggregateId = newEntityId;
    payload.rootAggregatePath = [];

    yield quest.create(newEntityId, payload);
    yield quest.me.addRef({path, entityId: newEntityId, beforeId});
    yield quest.kill([newEntityId], quest.goblin.id);
    return newEntityId;
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'copy-values', function* (
    quest,
    entityId,
    entity,
    deepCopy,
    next
  ) {
    if (!entity) {
      entity = yield quest.me.getEntity({entityId, privateState: true});
    } else {
      entity = new Goblin.Shredder(entity);
    }

    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const metaValues = entity.get('meta.values');
    if (!metaValues) {
      return;
    }

    next.parallel()();
    for (const path of metaValues.keys()) {
      const entityIds = entity.get(path);
      if (entityIds.size > 0 && entityIds.get(0)) {
        const entities = entity.get(`private.${path}`);
        quest.me.copyCollectionByValue(
          {
            path,
            entityIds,
            entities,
            deepCopy,
          },
          next.parallel()
        );
      }
    }
    yield next.sync();
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'add-val', function* (
    quest,
    path,
    entity,
    remote,
    beforeId
  ) {
    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      quest.log.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const valSubs = quest.goblin.getX('valSubs');
    const agg = common.getAggregationInfo(quest);
    const entityId = entity.get('id');

    const aggregateInfo = {
      rootAggregateId: agg.rootAggregateId,
      rootAggregatePath: agg.rootAggregatePath.concat([
        'private',
        path,
        entityId,
      ]),
    };

    if (
      entity.get('meta.rootAggregatePath').valueSeq().toArray().join('/') !==
      aggregateInfo.rootAggregatePath.join('/')
    ) {
      entity = entity.set(
        'meta.rootAggregatePath',
        aggregateInfo.rootAggregatePath
      );
    }

    if (entity.get('meta.parentEntity') !== quest.goblin.id) {
      entity = entity.set('meta.parentEntity', quest.goblin.id);
    }

    quest.do({entity});

    //Add a val for each feeds
    const feeds = yield quest.warehouse.getBranchSubscriptions({
      branch: quest.goblin.id,
      filters: ['system'],
    });

    const wAPI = quest.getAPI('workshop');
    for (const desktopId of feeds) {
      yield wAPI.createEntity({
        id: entityId,
        createFor: quest.goblin.id,
        desktopId,
        properties: {
          entity,
          status: quest.goblin.getState().get('meta.status'),
          parentEntity: entity.get('meta.parentEntity'),
          rootAggregateId: entity.get('meta.rootAggregateId'),
          rootAggregatePath: entity
            .get('meta.rootAggregatePath')
            .valueSeq()
            .toArray(),
          loadedBy: quest.goblin.id,
        },
      });
    }

    if (!valSubs[entityId]) {
      valSubs[entityId] = [];
    }

    const id = state.get('id');
    const rootAggregateId = state.get('meta.rootAggregateId');
    const rootAggregatePath = state
      .get('meta.rootAggregatePath')
      .valueSeq()
      .toArray();
    const hydrator = requestHydrate(
      quest.getSystemDesktop(),
      id,
      rootAggregateId,
      rootAggregatePath
    );
    valSubs[entityId].push(
      quest.sub.local(`*::${entityId}.<entity-changed>`, hydrator)
    );

    quest.goblin.setX('valSubs', valSubs);
    quest.evt('<collection-changed>', {
      eventType: 'added',
      entityId,
      beforeId,
      path,
    });

    if (!remote) {
      yield quest.me.reHydrateSync();
    }

    return entityId;
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'move-ref', function* (
    quest,
    path,
    entityId,
    beforeEntityId
  ) {
    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    quest.do();
    yield rehydrateAndEmit(quest, '<collection-changed>', {
      eventType: 'moved',
      entityId,
      beforeEntityId,
      path,
    });
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'clear-val', function* (quest, path, next) {
    const info = values[path];
    let resetValue = null;
    let entityIds;
    if (common.referenceUseArity(info)) {
      resetValue = [];
      const collection = quest.goblin.getState().get(path, null);
      entityIds = collection.valueSeq().toArray();
    } else {
      entityIds = [quest.goblin.getState().get(path, null)];
    }

    quest.do({path, value: resetValue});

    if (entityIds.length > 0) {
      const workshopAPI = quest.getAPI('workshop');
      const desktopId = quest.goblin.getX('desktopId');
      const valSubs = quest.goblin.getX('valSubs');
      for (const entityId of entityIds) {
        if (valSubs[entityId]) {
          for (const unsub of valSubs[entityId]) {
            unsub();
          }
          delete valSubs[entityId];
        }

        workshopAPI.requestEntityDeletion(
          {entityId, desktopId},
          next.parallel()
        );
      }
      yield next.sync();
      quest.goblin.setX('valSubs', valSubs);
    }
    return entityIds;
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'move-val', function* (
    quest,
    path,
    entityId,
    beforeEntityId
  ) {
    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    quest.do();
    yield rehydrateAndEmit(quest, '<collection-changed>', {
      eventType: 'moved',
      entityId,
      beforeEntityId,
      path,
    });
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'remove-ref', function* (
    quest,
    path,
    entityId,
    remote
  ) {
    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      quest.log.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const refSubs = quest.goblin.getX('refSubs');
    if (refSubs[entityId]) {
      for (const unsub of refSubs[entityId]) {
        unsub();
      }
      delete refSubs[entityId];
      quest.goblin.setX('refSubs', refSubs);
    }

    quest.do();
    quest.evt('<collection-changed>', {eventType: 'removed', entityId, path});
    if (!remote) {
      yield quest.me.reHydrateSync();
    }
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'remove-val', function* (
    quest,
    path,
    entityId,
    remote
  ) {
    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      quest.log.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const valSubs = quest.goblin.getX('valSubs');
    if (valSubs[entityId]) {
      for (const unsub of valSubs[entityId]) {
        unsub();
      }
      delete valSubs[entityId];
      quest.goblin.setX('valSubs', valSubs);
    }

    quest.do();

    try {
      const toRemoveAPI = yield quest.create(entityId, {
        id: entityId,
        desktopId: quest.getSystemDesktop(),
        mustExist: true,
      });
      yield toRemoveAPI.hardDeleteEntity();
    } finally {
      yield quest.kill([entityId], quest.goblin.id);
    }
    quest.evt('<collection-changed>', {eventType: 'removed', entityId, path});

    if (!remote) {
      yield quest.me.reHydrateSync();
    }
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'set-ref', function* (
    quest,
    path,
    entityId,
    remote
  ) {
    //handle reset
    if (entityId === null) {
      yield quest.me.clearRef({path});
      if (!remote) {
        yield quest.me.reHydrateSync();
      }
      return;
    }

    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      quest.log.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const refSubs = quest.goblin.getX('refSubs');

    //Set a ref for each feeds
    const feeds = yield quest.warehouse.getBranchSubscriptions({
      branch: quest.goblin.id,
      filters: ['system'],
    });

    const wAPI = quest.getAPI('workshop');
    for (const desktopId of feeds) {
      yield wAPI.createEntity({
        id: entityId,
        createFor: quest.goblin.id,
        desktopId,
        properties: {loadedBy: quest.goblin.id},
      });
    }

    if (!refSubs[entityId]) {
      refSubs[entityId] = [];
    }

    const id = state.get('id');
    const rootAggregateId = state.get('meta.rootAggregateId');
    const rootAggregatePath = state
      .get('meta.rootAggregatePath')
      .valueSeq()
      .toArray();
    const hydrator = requestHydrate(
      quest.getSystemDesktop(),
      id,
      rootAggregateId,
      rootAggregatePath
    );
    refSubs[entityId].push(
      quest.sub.local(`*::${entityId}.<entity-changed>`, hydrator)
    );

    quest.goblin.setX('refSubs', refSubs);
    quest.do();
    quest.evt('ref-setted');

    if (!remote) {
      yield quest.me.reHydrateSync();
    }
  });

  Goblin.registerQuest(goblinName, 'clear-ref', function (quest, path, next) {
    const state = quest.goblin.getState();

    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const info = references[path];
    let resetValue = null;
    let entityIds = [];
    if (common.referenceUseArity(info)) {
      resetValue = [];
      const collection = quest.goblin.getState().get(path, null);
      entityIds = collection.valueSeq().toArray();
    } else {
      entityIds = [quest.goblin.getState().get(path, null)];
    }

    quest.do({path, value: resetValue});

    const refSubs = quest.goblin.getX('refSubs');
    for (const entityId of entityIds) {
      if (refSubs[entityId]) {
        for (const unsub of refSubs[entityId]) {
          unsub();
        }
        delete refSubs[entityId];
      }
    }
    quest.goblin.setX('refSubs', refSubs);

    return entityIds;
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'set-val', function* (
    quest,
    path,
    entity,
    remote
  ) {
    const state = quest.goblin.getState();

    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      quest.log.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    //handle reset
    if (entity === null) {
      yield quest.me.clearVal({path});
      if (!remote) {
        yield quest.me.reHydrateSync();
      }
      return;
    }

    const entityId = entity.get('id');

    const valSubs = quest.goblin.getX('valSubs');

    //Set a ref for each feeds
    const feeds = yield quest.warehouse.getBranchSubscriptions({
      branch: quest.goblin.id,
      filters: ['system'],
    });

    const wAPI = quest.getAPI('workshop');
    for (const desktopId of feeds) {
      yield wAPI.createEntity({
        id: entityId,
        createFor: quest.goblin.id,
        desktopId,
        properties: {
          entity,
          parentEntity: entity.get('meta.parentEntity'),
          rootAggregateId: entity.get('meta.rootAggregateId'),
          rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
          loadedBy: quest.goblin.id,
        },
      });
    }

    if (!valSubs[entityId]) {
      valSubs[entityId] = [];
    }

    const rootAggregateId = state.get('meta.rootAggregateId');
    const rootAggregatePath = state
      .get('meta.rootAggregatePath')
      .valueSeq()
      .toArray();
    const hydrator = requestHydrate(
      quest.getSystemDesktop(),
      entityId,
      rootAggregateId,
      rootAggregatePath
    );

    valSubs[entityId].push(
      quest.sub.local(`*::${entityId}.<entity-changed>`, hydrator)
    );

    quest.goblin.setX('valSubs', valSubs);
    quest.do();
    quest.evt('val-setted');

    if (!remote) {
      yield quest.me.reHydrateSync();
    }
  });

  Goblin.registerQuest(goblinName, 'set-new-val', function* (
    quest,
    path,
    type,
    payload
  ) {
    const state = quest.goblin.getState();

    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    const newEntityId = `${type}@${quest.uuidV4()}`;
    const rootAggregatePath = state
      .get('meta.rootAggregatePath')
      .valueSeq()
      .toArray()
      .concat(['private', path, newEntityId]);

    const api = yield quest.createEntity(newEntityId, {
      ...payload,
      parentEntity: quest.goblin.id,
      rootAggregateId: state.get('meta.rootAggregateId'),
      rootAggregatePath,
      loadedBy: quest.goblin.id,
    });

    const entity = yield api.get();
    yield quest.me.setVal({path, entity});
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'persist', function* (quest, ripley) {
    if (transient) {
      //avoid persisting transient entities
      return;
    }

    const state = quest.goblin.getState();
    const entity = state.toJS();

    if (!entity) {
      throw new Error('Fatal...');
    }

    const agg = common.getAggregationInfo(quest);
    const rootAggregateId = agg.rootAggregateId;

    const r = quest.getStorage(entityStorage);

    yield r.set({
      table: type,
      documents: entity,
    });

    if (rootAggregateId !== entity.id) {
      const rootType = rootAggregateId.split('@', 1)[0];
      const rootAggregatePath = agg.rootAggregatePath;
      yield r.setIn({
        table: rootType,
        documentId: rootAggregateId,
        path: rootAggregatePath,
        value: entity,
      });
    }

    if (ripley !== true) {
      quest.do({state: entity, db: quest.getSession()});
    }
  });

  if (buildSummaries) {
    Goblin.registerQuest(goblinName, 'build-summaries', function* (
      quest,
      entity,
      peers,
      next
    ) {
      let summaries = null;
      if (common.isGenerator(buildSummaries)) {
        summaries = yield* buildSummaries(
          quest,
          entity,
          peers,
          new MarkdownBuilder(),
          StringBuilder,
          next
        );
      } else {
        summaries = buildSummaries(
          quest,
          entity,
          peers,
          new MarkdownBuilder(),
          StringBuilder
        );
      }

      Object.entries(summaries).forEach(([k, v]) => {
        if (summaries[k] === undefined) {
          throw new Error(
            `Bad summaries returned for ${type}
            check buildSummaries, especialy the ${k} props.`
          );
        }
        if (Shredder.isShredder(v)) {
          [k] = v.toJS();
        }
      });

      const ok = yield* checkSummaries(
        quest,
        'entity-builder.persist',
        goblinName,
        summaries
      );
      if (!ok) {
        //- throw new Error(`Fatal error, inconsistant summaries in entity id=${entity.id}`);
      }

      quest.do({summaries});

      // quest.evt('described');
    });
  }

  if (buildViews) {
    Goblin.registerQuest(goblinName, 'build-views', function* (
      quest,
      entity,
      peers,
      next
    ) {
      let views = null;
      if (common.isGenerator(buildViews)) {
        views = yield* buildViews(quest, entity, peers, next);
      } else {
        views = buildViews(quest, entity, peers);
      }
      quest.do({views});
    });
  }

  if (buildAlerts) {
    Goblin.registerQuest(goblinName, 'build-alerts', function* (
      quest,
      entity,
      peers,
      next
    ) {
      let alerts = null;
      if (common.isGenerator(buildAlerts)) {
        alerts = yield* buildAlerts(
          quest,
          entity,
          peers,
          new MarkdownBuilder(),
          StringBuilder,
          next
        );
      } else {
        alerts = buildAlerts(
          quest,
          entity,
          peers,
          new MarkdownBuilder(),
          StringBuilder
        );
      }
      quest.do({alerts});
    });
  }

  if (indexer) {
    Goblin.registerQuest(goblinName, 'index', function* (
      quest,
      entity,
      peers,
      next
    ) {
      if (!entity) {
        entity = quest.goblin.getState();
      }

      let doc = {};

      if (common.isGenerator(indexer)) {
        doc = yield* indexer(
          quest,
          entity,
          peers,
          new MarkdownBuilder(),
          StringBuilder,
          next
        );
      } else {
        doc = indexer(
          quest,
          entity,
          peers,
          new MarkdownBuilder(),
          StringBuilder
        );
      }

      //indexed by default
      doc['meta/status'] = entity.get('meta.status');

      if (buildAlerts) {
        doc['meta/hasErrors'] = entity.get('meta.hasErrors');
        doc['meta/hasWarnings'] = entity.get('meta.hasWarning');
      }

      //auto indexed props (do ctrl+shift+f when adding new rules)
      if (properties) {
        for (const [prop, info] of Object.entries(properties)) {
          if (info.type && info.type === 'enum') {
            doc[prop] = entity.get(prop, '');
          }
          if (info.type && info.type === 'bool') {
            doc[prop] = entity.get(prop, false);
          }
          if (info.type && info.type === 'date') {
            const entityValue = entity.get(prop, null);
            //only index a valid date or null
            let value = null;
            if (entityValue && !isNaN(new Date(entityValue))) {
              value = entityValue;
            }
            doc[prop] = value;
          }
        }
      }
      const mapping = indexerMappingsByType.find(
        (mapping) => mapping.type === type
      ).properties;

      if (mapping) {
        for (const prop of Object.keys(doc)) {
          const info = mapping[prop];

          if (info && info.type === 'date') {
            //only index a valid date or null
            if (isNaN(new Date(doc[prop]))) {
              doc[prop] = null;
            }
          }
        }
      }

      Object.entries(doc).forEach(([k, v]) => {
        if (doc[k] === undefined) {
          throw new Error(
            `Bad indexer returned for ${type}
            check indexer return doc, especialy the ${k} props.`
          );
        }
        if (Shredder.isShredder(v)) {
          doc[k] = v.toJS();
        }
      });
      quest.do({document: doc});
      yield quest.me.setIndex({
        docId: entity.get('id'),
        doc,
      });
    });

    Goblin.registerQuest(goblinName, 'set-index', function* (
      quest,
      docId,
      doc
    ) {
      const multiLanguageDoc = yield buildMultiLanguageSummaries(
        quest,
        doc,
        true
      );
      const mandate = quest.getSession();
      const body = Object.entries(multiLanguageDoc).reduce(
        (body, [locale, doc]) => {
          if (doc['meta/status'] === 'trashed') {
            body.push({
              delete: {
                _index:
                  locale === '_original'
                    ? mandate
                    : `${mandate}-${locale.toLowerCase().replace(/\//g, '-')}`,
                _type: type,
                _id: docId,
              },
            });
          } else {
            body.push({
              index: {
                _index:
                  locale === '_original'
                    ? mandate
                    : `${mandate}-${locale.toLowerCase().replace(/\//g, '-')}`,
                _type: type,
                _id: docId,
              },
            });
            if (doc.info) {
              doc.searchAutocomplete = doc.info;
              doc.searchPhonetic = doc.info;
            }
            body.push(doc);
          }

          return body;
        },
        []
      );

      if (body.length > 0) {
        quest.evt('<index-entity-requested>', {
          desktopId: quest.getDesktop(),
          body,
        });
      } else {
        console.warn(`${type}.set-index generated an empty body to index`);
      }
    });
  }

  if (references) {
    Object.keys(references).forEach((path) => {
      Goblin.registerQuest(goblinName, `fetch-${path}`, function* (quest) {
        const peers = {};
        const entity = quest.goblin.getState();
        yield fetchPeers(
          quest,
          peers,
          entity,
          new Goblin.Shredder(references),
          path,
          false
        );
        return peers[Object.keys(peers)[0]];
      });
    });
  }

  if (values) {
    Object.keys(values).forEach((path) => {
      Goblin.registerQuest(goblinName, `fetch-${path}`, function (quest) {
        const peers = {};
        const entity = quest.goblin.getState();
        fetchValues(quest, peers, entity, new Goblin.Shredder(values), path);
        return peers[Object.keys(peers)[0]];
      });
    });
  }

  if (computer && sums) {
    Goblin.registerQuest(goblinName, 'compute', function* (
      quest,
      entity,
      peers,
      next
    ) {
      if (!entity) {
        entity = quest.goblin.getState();
      }

      let computerState = {};

      for (const [sum, info] of Object.entries(sums)) {
        switch (info.type) {
          case 'price':
            computerState[sum] = new BigNumber(info.defaultValue);
            break;
          default:
            computerState[sum] = info.defaultValue;
        }
      }

      if (peers) {
        Object.keys(peers)
          .filter((type) => Array.isArray(peers[type]))
          .forEach((type) => {
            const subSums = peers[type];
            Object.keys(computerState).forEach((sum) => {
              if (!sums[sum]) {
                return;
              }

              if (sum.startsWith('self-')) {
                return;
              }

              const sumType = sums[sum].type;
              const defaultValue = sums[sum].defaultValue;

              switch (sumType) {
                case 'number':
                  computerState[sum] =
                    computerState[sum] +
                    subSums.reduce((p, subSum) => {
                      if (subSum.get('sums')) {
                        if (!subSum.get(`sums.${sum}`)) {
                          subSum = subSum.set(`sums.${sum}`, defaultValue);
                        }
                        return p + subSum.get(`sums.${sum}`);
                      } else {
                        return p;
                      }
                    }, defaultValue);
                  break;
                case 'price':
                  computerState[sum] = computerState[sum].plus(
                    subSums.reduce((p, subSum) => {
                      if (subSum.get('sums')) {
                        if (!subSum.get(`sums.${sum}`)) {
                          subSum = subSum.set(
                            `sums.${sum}`,
                            new BigNumber(defaultValue)
                          );
                        }
                        return p.plus(subSum.get(`sums.${sum}`));
                      } else {
                        return p;
                      }
                    }, new BigNumber(defaultValue))
                  );
                  break;
                default:
                // TODO: impl. other type auto aggregation, ex. array
              }
            });
          });
      }

      //Inject bignumber as N for computer
      computerState.N = BigNumber.clone();
      if (common.isGenerator(computer)) {
        computerState = yield* computer(
          quest,
          computerState,
          entity,
          peers,
          next
        );
      } else {
        computerState = computer(quest, computerState, entity, peers);
      }

      const ok = yield* checkSums(
        quest,
        'entity-builder.compute',
        goblinName,
        computerState
      );
      if (!ok) {
        throw new Error(
          `Fatal error, inconsistant sums in entity id=${entity.id}`
        );
      }

      quest.do({sums: computerState});
    });
  }

  // Dispose subscriptions and notify services of disposition...
  const dispose = (quest) => {
    let subs = quest.goblin.getX('refSubs');
    if (subs) {
      Object.keys(subs).forEach((s) => {
        for (const unsub of subs[s]) {
          unsub();
        }
      });
    }

    subs = quest.goblin.getX('valSubs');
    if (subs) {
      Object.keys(subs).forEach((s) => {
        for (const unsub of subs[s]) {
          unsub();
        }
      });
    }

    subs = quest.goblin.getX('graphSubs');
    if (subs) {
      Object.values(subs).forEach((s) => {
        s.startUnsub();
        s.stopUnsub();
      });
    }
    delete lastChangedHashes[quest.goblin.id];
  };

  /////////////////////////////////////////////////////////////////
  // <Entity flow builder>
  const buildEntityFlowPropagator = (verb) => {
    const questName = `${verb}-entity`;
    common.registerQuests(goblinName, {
      [questName]: function* (quest, async = false) {
        const entity = quest.goblin.getState();
        const entityId = entity.get('id');
        const rootAggregateId = entity.get('meta.rootAggregateId');
        const rootAggregatePath = entity
          .get('meta.rootAggregatePath')
          .valueSeq()
          .toArray();

        if (!async) {
          //change status sync (default behavior)
          const entityFlowUpdaterAPI = quest.getAPI('entity-flow-updater');
          yield entityFlowUpdaterAPI.changeEntityStatus({
            desktopId: quest.getSystemDesktop(),
            verb,
            entityId,
            rootAggregateId,
            rootAggregatePath,
          });
        } else {
          //fire event, don't wait for end of change
          quest.evt(`${entityId}.${verb}-<entity-flow-change-requested>`, {
            desktopId: quest.getSystemDesktop(),
            verb,
            entityId,
            rootAggregateId,
            rootAggregatePath,
          });
        }
      },
    });
  };

  buildEntityFlowPropagator('publish');
  buildEntityFlowPropagator('restore');
  buildEntityFlowPropagator('archive');
  buildEntityFlowPropagator('trash');

  const entityFlowQuests = {
    _publish: function* (quest) {
      const document = quest.goblin.getState();

      //skip quest if already published
      if (document.get('meta.status') === 'published') {
        return;
      }

      //set published
      quest.do();

      if (onPublish) {
        yield quest.me.onPublish();
      }
      yield quest.me.reHydrateSync();
    },
    _archive: function* (quest) {
      const document = quest.goblin.getState();

      //skip quest if already archived
      if (document.get('meta.status') === 'archived') {
        //avoid unecessary upsert by canceling
        return quest.cancel();
      }

      //avoid archiving draft
      if (document.get('meta.status') === 'draft') {
        return quest.cancel();
      }

      //set archived
      quest.do();

      if (onArchive) {
        yield quest.me.onArchive();
      }
      yield quest.me.reHydrateSync();
    },
    _trash: function* (quest) {
      const document = quest.goblin.getState();

      //skip quest if already archived
      if (document.get('meta.status') === 'trashed') {
        //avoid unecessary upsert by canceling
        return quest.cancel();
      }

      //set trashed
      quest.do();

      if (onTrash) {
        yield quest.me.onTrash();
      }
      yield quest.me.reHydrateSync();
    },
  };

  common.registerQuests(goblinName, entityFlowQuests);

  /******************************************************************************/
  // </Entity flow builder>

  Goblin.registerQuest(goblinName, 'hard-delete-entity', function* (
    quest,
    entity
  ) {
    dispose(quest);

    if (!entity) {
      entity = quest.goblin.getState().toJS();
    }

    const r = quest.getStorage('rethink');
    const e = quest.getStorage('elastic');
    quest.log.dbg('deleting ', entity.id);
    yield r.del({
      table: entity.meta.type,
      documentId: entity.id,
    });

    if (indexer) {
      quest.log.dbg('unindexing ', entity.id);
      yield e.unindex({type: entity.meta.type, documentId: entity.id});
    }

    //cascade delete sub-documents
    const subDelete = watt(function* (subEntity) {
      for (const path in subEntity.meta.values) {
        for (const entityId of subEntity[path]) {
          const toDelete = subEntity.private[path][entityId];
          if (toDelete) {
            const subType = toDelete.id.split('@', 1)[0];
            quest.log.dbg('deleting ', toDelete.id);
            yield r.del({
              table: subType,
              documentId: toDelete.id,
            });
            if (configs[subType].indexer) {
              quest.log.dbg('unindexing ', toDelete.id);
              yield e.unindex({
                type: subType,
                documentId: toDelete.id,
              });
            }
            yield subDelete(toDelete);
          }
        }
      }
    });
    yield subDelete(entity);
  });

  /******************************************************************************/

  Goblin.registerQuest(goblinName, 'delete', function (quest) {
    dispose(quest);
  });

  // Create a Goblin with initial state and handlers
  return Goblin.configure(goblinName, logicState, logicHandlers, goblinConfig);
}

/******************************************************************************/

builder.entities = types;
builder.indexes = indexes;
builder.customIndexesByType = customIndexesByType;
builder.orderIndexesByType = orderIndexesByType;
builder.indexerMappingsByType = indexerMappingsByType;
builder.configurations = configs;
module.exports = builder;
