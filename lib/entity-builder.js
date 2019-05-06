'use strict';

const watt = require('gigawatts');
const Goblin = require('xcraft-core-goblin');
const Shredder = require('xcraft-core-shredder');
const xUtils = require('xcraft-core-utils');
const entityMeta = require('./entity-meta');
const common = require('./workitems/common.js');
const BigNumber = require('bignumber.js');
const MarkdownBuilder = require('./markdown-builder.js');
const StringBuilder = require('goblin-nabu/lib/string-builder.js');
const {
  buildPeers,
  fetchValues,
  fetchPeers,
} = require('./entity-builder/peers.js');

const {
  buildReferencesQuests,
  buildValuesQuests,
} = require('./entity-builder/methods.js');

const buildMultiLanguageSummaries = require('goblin-nabu/lib/summaries.js');

const types = [];
const indexes = [];
const customIndexesByType = [];
const configs = {};

const handleCollectionChanged = (quest, desktopId, skipped) =>
  function*(err, {msg}) {
    const extractEntityId = msg => msg.data.entityId;
    const extractType = msg =>
      msg.data.entityType
        ? msg.data.entityType
        : msg.data.entityId.split('@')[0];
    const handleType = msg => !skipped.includes(extractType(msg));

    if (handleType(msg)) {
      const {eventType} = msg.data;
      const entityId = extractEntityId(msg);
      switch (eventType) {
        case 'cleared':
          yield quest.kill([msg.data.entityIds]);
          break;
        case 'added':
          yield quest.create(entityId, {
            id: entityId,
            desktopId,
            mustExist: true,
            rootAggregateId: quest.goblin
              .getState()
              .get('meta.rootAggregateId'),
            rootAggregatePath: quest.goblin
              .getState()
              .get('meta.rootAggregatePath')
              .toArray()
              .concat(['private', entityId]),
          });
          break;
        case 'removed':
          yield quest.kill([entityId]);
          break;
      }
    }
  };

const loadGraph = (toCreate, desktopId, entity) => (
  items,
  isVal,
  lvl,
  stopAt,
  skipped,
  peers
) => {
  for (const v in items) {
    if (common.referenceUseArity(items[v])) {
      const type = common.getReferenceType(items[v]);
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
          rootAggregatePath: e.get('meta.rootAggregatePath').toArray(),
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
      const type = common.getReferenceType(items[v]);
      if (skipped.includes(type)) {
        continue;
      }

      const e = peers[v];
      const rId = e.get('id');
      //Prevent loop
      if (rId !== entity.get('id')) {
        const payload = {
          id: rId,
          desktopId,
          entityId: rId,
          entity: e,
          rootAggregateId: e.get('meta.rootAggregateId'),
          rootAggregatePath: e.get('meta.rootAggregatePath').toArray(),
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
    customIndexes,
    references,
    values,
    properties,
    actions,
    quests,
    onNew,
    afterNew,
    buildSummaries,
    hydratePeers,
    indexer,
    computer,
    newEntityStatus,
    onArchive,
    onPublish,
    onTrash,
    cacheSize,
    muted,
    //enableHistory,
  } = config;

  let goblinName = type;
  types.push(type);
  configs[type] = config;

  if (indexer) {
    indexes.push(type);
  }

  if (customIndexes && customIndexes.length > 0) {
    customIndexesByType.push({type, customIndexes});
  }

  if (name) {
    goblinName = name;
  }

  const logicState = {};

  const goblinConfig = {
    ripley: {
      persist: {
        mode: 'all',
      },
    },
    cacheSize: cacheSize === undefined ? 10 : cacheSize,
    schedulingMode: 'background',
  };

  let lastChangedHashes = {};

  const logicHandlers = Object.assign(
    {},
    require('./entity-builder/reducers.js')
  );

  const rehydrateSync = watt(function*(quest, next) {
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
    common.registerActions(goblinName, actions, rehydrateSync);
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

  const rehydrateAndEmit = watt(function*(quest, verb, payload) {
    quest.evt(verb, payload);
    yield quest.me.reHydrateSync();
  });

  const requestHydrate = (
    desktopId,
    entityId,
    rootAggregateId,
    rootAggregatePath
  ) => (err, {resp}) => {
    resp.evt('hydrate-entity-requested', {
      desktopId,
      entityId,
      rootAggregateId,
      rootAggregatePath,
      muteChanged: false,
    });
  };

  Goblin.registerQuest(
    goblinName,
    'create',
    function*(
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

      if (!parentEntity) {
        parentEntity = null;
      }

      if (!rootAggregateId) {
        rootAggregateId = id;
      }

      if (!rootAggregatePath) {
        rootAggregatePath = [];
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

      const notifier = (quest, muteChanged) => {
        if (!muted && !muteChanged) {
          quest.log.verb(`${quest.goblin.id} changed`);
          quest.evt('changed', {id: quest.goblin.id});
        }
      };

      quest.goblin.setX('notifyChanged', notifier); //_.debounce(notifier, 500));

      let isNew = false;
      const r = quest.getStorage('rethink');

      //Copy case init:
      if (copyId) {
        quest.log.info('COPY ENTITY', id);
        if (copyEntity) {
          entity = new Goblin.Shredder(copyEntity);
        } else {
          entity = yield r.get({
            table: type,
            documentId: copyId,
            privateState: true,
          });
          entity = new Goblin.Shredder(entity);
        }
        if (!entity) {
          throw new Error(`Cannot copy entity ${copyId}, not found`);
        }
        const makeDeepCopy = require('./entity-builder/makeDeepCopy.js');

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
            newEntity => {
              r.set({
                table: newEntity.get('id').split('@')[0],
                documents: newEntity.toJS(),
              });
              const rootType = rootAggregateId.split('@')[0];
              newEntity = newEntity.del('meta.persistedFromDesktopId');
              r.setIn({
                table: rootType,
                documentId: rootAggregateId,
                path: newEntity.get('meta.rootAggregatePath').toArray(),
                value: newEntity.toJS(),
              });
            }
          );
        } else {
          //reset cached value
          entity = entity.set('private', {});
          for (const path in values) {
            //reset ids
            entity = entity.set(path, []);
          }

          entity = makeDeepCopy(
            entity,
            id,
            copyInitialStatus,
            rootAggregateId,
            rootAggregatePath,
            parentEntity,
            newEntity => {
              r.set({
                table: newEntity.get('id').split('@')[0],
                documents: newEntity.toJS(),
              });
              const rootType = rootAggregateId.split('@')[0];
              newEntity = newEntity.del('meta.persistedFromDesktopId');
              r.setIn({
                table: rootType,
                documentId: rootAggregateId,
                path: newEntity.get('meta.rootAggregatePath').toArray(),
                value: newEntity.toJS(),
              });
            }
          );
        }
      }

      if (!entity) {
        //If we create the rootAggregate
        if (rootAggregateId === id) {
          entity = yield r.get({
            table: type,
            documentId: id,
            privateState: true,
          });
        } else {
          const rootType = rootAggregateId.split('@')[0];
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
        //ENSURE REFS/VALUES PATH EXIST
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

        //Init private data
        if (!entity.get('private')) {
          entity = entity.set('private', {});
        }

        if (values) {
          //set initial private values
          for (const val in values) {
            if (!entity.get(`private.${val}`)) {
              entity = entity.set(`private.${val}`, {});
            }
          }
        }

        if (computer) {
          if (!entity.get('sums')) {
            entity = entity.set('sums', {base: 0});
          }
        }

        entity = entityMeta.set(entity, type, references, values);

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
          const err = new Error(`Entity not found ${id}`);
          err.code = 'EENTITY_NOT_FOUND';
          throw err;
        }
        try {
          if (onNew) {
            // We support the same goblin quest feature:
            // auto parameter->value mapping

            const params = xUtils.reflect
              .funcParams(onNew)
              .filter(param => !/^(quest|next)$/.test(param));

            const _onNew = (q, m, n) => {
              const args = params.map(p => {
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

        // draft -> published -> archived
        const getInitialStatus = watt(function*() {
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

        let initialStatus = yield getInitialStatus();

        //set meta
        entity = entityMeta.set(
          entity,
          type,
          references,
          values,
          parentEntity,
          rootAggregateId,
          rootAggregatePath,
          initialStatus
        );

        r.set(
          {
            table: type,
            documents: entity.toJS(),
          },
          next.parallel()
        );

        if (rootAggregateId !== entity.get('id')) {
          const rootType = rootAggregateId.split('@')[0];
          entity = entity.del('meta.persistedFromDesktopId');
          r.setIn(
            {
              table: rootType,
              documentId: rootAggregateId,
              path: rootAggregatePath,
              value: entity.toJS(),
            },
            next.parallel()
          );
        }
      }

      quest.goblin.setX('isNew', isNew);
      if (isNew) {
        quest.defer(() => quest.goblin.setX('isNew', false));
      }
      quest.doSync({entity}, next.parallel());
      yield next.sync();
      common.createWaitLoader(quest);

      //backup 'at load' state
      const freshEntity = quest.goblin.getState();
      quest.dispatch('backup', {entity: freshEntity});
      yield quest.me.afterCreate();
      return quest.goblin.id;
    },
    ['*::*.loaded']
  );

  Goblin.registerQuest(
    goblinName,
    'after-create',
    function*(quest, next) {
      const entity = quest.goblin.getState();
      const valSubs = quest.goblin.getX('valSubs');
      const refSubs = quest.goblin.getX('refSubs');
      const isNew = quest.goblin.getX('isNew');

      const desktopId = quest.goblin.getX('desktopId');
      const entityId = entity.get('id');
      const rootAggregateId = entity.get('meta.rootAggregateId');
      const rootAggregatePath = entity.get('meta.rootAggregatePath').toArray();
      const hydrator = requestHydrate(
        desktopId,
        entityId,
        rootAggregateId,
        rootAggregatePath
      );

      if (entity.get('meta.status') !== 'archived') {
        //SUBSCRIBE TO REF CHANGES
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
              //RE-HYDRATE
              refSubs[rId].push(quest.sub(`*::${rId}.changed`, hydrator));
            }
          } else {
            //Entity case
            const rId = entity.get(path);
            if (rId && rId.length) {
              if (!refSubs[rId]) {
                refSubs[rId] = [];
              }

              //RE-HYDRATE
              refSubs[rId].push(quest.sub(`*::${rId}.changed`, hydrator));
            }
          }
        }
        quest.goblin.setX('refSubs', refSubs);

        //SUBSCRIBE TO VAL CHANGES
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
              //RE-HYDRATE
              valSubs[rId].push(quest.sub(`*::${rId}.changed`, hydrator));
            }
          } else {
            //Entity case
            const rId = entity.get(path);
            if (rId && rId.length) {
              if (!valSubs[rId]) {
                valSubs[rId] = [];
              }

              //RE-HYDRATE
              valSubs[rId].push(quest.sub(`*::${rId}.changed`, hydrator));
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
    },
    ['*::*.changed']
  );

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);
  Goblin.registerQuest(goblinName, 'get-entities', common.getEntitiesQuest);
  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  // Load graph
  Goblin.registerQuest(goblinName, 'load-graph', function*(
    quest,
    loadedBy,
    level,
    stopAtLevel,
    skipped,
    _goblinFeed,
    next
  ) {
    if (!loadedBy) {
      throw new Error('Cannot load graph without loadedBy params');
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
    const desktopId = quest.goblin.getX('desktopId');
    const entity = quest.goblin.getState();
    const toCreate = [];
    if (level <= stopAtLevel) {
      //SUBSCRIBE TO COLLECTION CHANGED
      quest.goblin.defer(
        quest.sub(
          `*::${quest.goblin.id}.collection-changed`,
          handleCollectionChanged(quest, desktopId, skipped)
        )
      );
      const peers = yield buildPeers(quest, entity);
      if (entity.get('meta.references')) {
        loadGraph(toCreate, desktopId, entity)(
          entity.get('meta.references').toJS(),
          false,
          level,
          stopAtLevel,
          skipped,
          peers
        );
      }

      if (entity.get('meta.values')) {
        loadGraph(toCreate, desktopId, entity)(
          entity.get('meta.values').toJS(),
          true,
          level,
          stopAtLevel,
          skipped,
          peers
        );
      }
      for (const c of toCreate) {
        quest.createFor(
          loadedBy,
          loadedBy,
          c.id,
          Object.assign(c.payload, {_goblinFeed}),
          next.parallel()
        );
      }
      const entitiesAPI = yield next.sync();
      if (entitiesAPI) {
        for (const api of entitiesAPI.values()) {
          api.loadGraph(
            {
              loadedBy,
              level: level + 1,
              stopAtLevel: stopAtLevel,
              skipped,
              _goblinFeed,
            },
            next.parallel()
          );
        }
        yield next.sync();
      }
    }
  });

  // Notify changed
  // emit an event if the state is new
  Goblin.registerQuest(goblinName, 'notify-changed', function(
    quest,
    muteChanged
  ) {
    const notifyChanged = quest.goblin.getX('notifyChanged');
    if (!notifyChanged) {
      quest.log.warn('Entity is unloaded while notify-changed is called...');
      return false;
    }

    if (!lastChangedHashes[quest.goblin.id]) {
      lastChangedHashes[quest.goblin.id] = quest.goblin.getState().hashCode();
      notifyChanged(quest, muteChanged);
      return true;
    }

    const currentHash = quest.goblin.getState().hashCode();
    if (currentHash === lastChangedHashes[quest.goblin.id]) {
      return false;
    }

    notifyChanged(quest, muteChanged);
    lastChangedHashes[quest.goblin.id] = currentHash;
    return true;
  });

  Goblin.registerQuest(goblinName, 'hydrate', function*(
    quest,
    muteChanged,
    options,
    next
  ) {
    let entity = quest.goblin.getState();
    try {
      //default behavior
      let needPeers = true;
      let doBuildSummaries = !!buildSummaries;
      let doCompute = !!computer;
      let doIndex = !!indexer;

      //if options is passed, change defaults
      if (options) {
        if (options.compute !== undefined) {
          doCompute = options.compute;
        }
        if (options.buildSummaries !== undefined) {
          doBuildSummaries = options.buildSummaries;
        }
        if (options.index !== undefined) {
          doIndex = options.index;
        }
        if (!doIndex && !doBuildSummaries && !doCompute) {
          needPeers = false;
        }
      }

      const lastHydrate = quest.goblin.getX('lastHydrate');
      let peers = null;

      if (needPeers && (references || values)) {
        peers = yield buildPeers(quest, entity);
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
        if (buildSummaries && doBuildSummaries) {
          quest.me.buildSummaries({entity, peers}, next.parallel());
        }

        try {
          if (computer && doCompute) {
            quest.me.compute({entity, peers}, next.parallel());
          }

          yield next.sync();

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

          const changed = yield quest.me.notifyChanged({muteChanged});
          const isNew = quest.goblin.getX('isNew');
          if (changed && !isNew) {
            if (entity.get('meta.rootAggregateId') !== quest.goblin.id) {
              const parentId = entity.get('meta.parentEntity');
              quest.evt('update-aggregate-requested', {
                parentId,
                desktopId: quest.getDesktop(),
                entityId: entity.get('id'),
                requestedBy: quest.goblin.getX('_goblinCaller'),
                muteChanged,
              });
            }

            if (peers && hydratePeers) {
              hydratePeers
                .filter(peerKey => !!peers[peerKey])
                .map(peerKey => peers[peerKey])
                .forEach(peer => {
                  const entities = Array.isArray(peer) ? peer : [peer];
                  entities.forEach(entity => {
                    if (!entity.get('meta.rootAggregatePath')) {
                      console.warn(
                        `Malformed peers found in entity: ${entity.get('id')}`
                      );
                      return;
                    }
                    quest.evt('hydrate-entity-requested', {
                      peerHydrate: true,
                      desktopId: quest.getDesktop(),
                      entityId: entity.get('id'),
                      rootAggregateId: entity.get('meta.rootAggregateId'),
                      rootAggregatePath: entity
                        .get('meta.rootAggregatePath')
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
          `problème de construction du graph`,
          `voir avec Sam`,
          ex.stack || ex.message || ex
        );
      }
      delete ex._rethrow;
      throw ex;
    }
  });

  Goblin.registerQuest(goblinName, 'change', function*(quest, path, newValue) {
    const entity = quest.goblin.getState();
    //avoid change archives
    if (entity.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }
    //Prevent inserting undefined in storage
    if (newValue === undefined) {
      newValue = null;
      quest.log.warn(
        'Try to change ',
        quest.goblin.id,
        ' with "undefined" at:',
        path
      );
    }

    const property = path.split('.')[0];
    //Check properties
    if (properties) {
      const propInfo = properties[property];
      if (propInfo) {
        if (propInfo.type) {
          //TODO: isValid newValue of type?
          switch (propInfo.type) {
            default:
          }
        } else {
          quest.log.warn(
            `${property} is not declared correctly in ${type} entity properties: missing type info`
          );
        }
      } else {
        quest.log.warn(
          `${property} is not declared in ${type} entity properties`
        );
      }
    } else {
      quest.log.warn(`no properties defined for entity ${type}`);
    }
    const oldHash = quest.goblin.getState().hashCode();
    quest.do();
    if (oldHash === quest.goblin.getState().hashCode()) {
      return;
    }
    yield quest.me.reHydrateSync();
  });

  Goblin.registerQuest(goblinName, 'update-aggregate', function*(
    quest,
    entityId,
    desktopId,
    muteChanged,
    _goblinFeed
  ) {
    const state = quest.goblin.getState();
    let entity;
    try {
      const valueAPI = yield quest.create(entityId, {
        id: entityId,
        desktopId,
        _goblinFeed,
      });
      entity = yield valueAPI.get();
      const fullPath = entity.get('meta.rootAggregatePath').toArray();
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
      yield quest.kill([entityId]);
    }
  });

  Goblin.registerQuest(goblinName, 're-hydrate-async', function(
    quest,
    muteChanged,
    muteHydrated,
    options
  ) {
    const entity = quest.goblin.getState();
    quest.evt('hydrate-entity-requested', {
      desktopId: quest.getDesktop(),
      entityId: entity.get('id'),
      rootAggregateId: entity.get('meta.rootAggregateId'),
      rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
      muteChanged,
      muteHydrated,
      options,
    });
  });

  Goblin.registerQuest(goblinName, 're-hydrate-sync', function*(
    quest,
    muteChanged,
    muteHydrated,
    options
  ) {
    yield quest.me.hydrate({muteChanged, options});
    yield quest.me.persist();
    if (!muteHydrated) {
      const hydratedEntity = quest.goblin.getState();
      const type = hydratedEntity.get('meta.type');
      quest.evt(`${type}-hydrated`, {
        entity: hydratedEntity,
        desktopId: quest.getDesktop(),
      });
    }
  });

  Goblin.registerQuest(goblinName, 'rebuild', function*(quest) {
    //rebuild values
    const r = quest.getStorage('rethink');
    const toCheck = {};
    const entity = quest.goblin.getState();
    const values = entity.get('meta.values');
    const currentRootPath = quest.goblin.getX('rootAggregatePath');
    if (values) {
      for (const path of values.keys()) {
        fetchValues(quest, toCheck, entity, values, path, true);
      }
      if (toCheck) {
        for (const [key, values] of Object.entries(toCheck)) {
          if (values) {
            for (let entity of Object.values(values)) {
              const entityId = entity.get('id');
              const type = entity.get('meta.type');
              const rootId = entity.get('meta.rootAggregateId');
              const rootPath = entity.get('meta.rootAggregatePath');
              if (!entityId) {
                console.log('aieaiaiea');
                continue;
              }

              if (!type) {
                console.log('aieaiaiea');
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
    }
  });

  Goblin.registerQuest(goblinName, 'delete-aggregate', function*(
    quest,
    entity
  ) {
    quest.do();
    const subs = quest.goblin.getX('valSubs');
    subs[entity.id]();
    yield quest.me.reHydrateSync();
  });

  Goblin.registerQuest(goblinName, 'replace', function*(quest, entity) {
    quest.do({entity});
    if (entity.get('meta.index')) {
      yield quest.me.setIndex({
        docId: entity.get('id'),
        doc: entity.get('meta.index'),
      });
    }
  });

  Goblin.registerQuest(goblinName, 'apply', function*(
    quest,
    patch,
    muteChanged,
    muteHydrated,
    force,
    sync
  ) {
    const entity = quest.goblin.getState();
    //avoid change archives
    if (!force && entity.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
      return;
    }

    //Check properties
    if (properties) {
      Object.keys(patch).forEach(property => {
        const propInfo = properties[property];
        if (propInfo) {
          if (propInfo.type) {
            //TODO: isValid newValue of type?
            switch (propInfo.type) {
              default:
            }
          } else {
            quest.log.warn(
              `${property} is not declared correctly in ${type} entity properties: missing type info`
            );
          }
        } else {
          quest.log.warn(
            `${property} is not declared in ${type} entity properties`
          );
        }
      });
    } else {
      quest.log.warn(`no properties defined for entity ${type}`);
    }

    const oldHash = quest.goblin.getState().hashCode();
    quest.do();
    if (oldHash === quest.goblin.getState().hashCode()) {
      return;
    }

    yield quest.me.reHydrateSync({muteChanged, muteHydrated});
  });

  Goblin.registerQuest(goblinName, 'get', function(quest, path) {
    if (!path) {
      return quest.goblin.getState();
    } else {
      return quest.goblin.getState().get(path);
    }
  });

  Goblin.registerQuest(
    goblinName,
    'copy-collection-by-ref',
    function*(quest, path, entityIds, next) {
      quest.do();
      const refSubs = quest.goblin.getX('refSubs');
      const desktopId = quest.getDesktop();
      for (const entityId of entityIds) {
        //Add a ref for us too
        quest.create(
          entityId,
          {
            id: entityId,
            desktopId,
            loadedBy: quest.goblin.id,
          },
          next.parallel()
        );

        if (!refSubs[entityId]) {
          refSubs[entityId] = [];
        }

        const entity = quest.goblin.getState();
        const desktopId = quest.goblin.getX('desktopId');
        const entityId = entity.get('id');
        const rootAggregateId = entity.get('meta.rootAggregateId');
        const rootAggregatePath = entity
          .get('meta.rootAggregatePath')
          .toArray();
        const hydrator = requestHydrate(
          desktopId,
          entityId,
          rootAggregateId,
          rootAggregatePath
        );
        refSubs[entityId].push(quest.sub(`*::${entityId}.changed`, hydrator));

        quest.goblin.setX('refSubs', refSubs);
        quest.evt('collection-changed', {eventType: 'added', entityId});
      }
      yield next.sync();
      yield quest.me.reHydrateSync();
    },
    ['*::*.changed']
  );

  Goblin.registerQuest(
    goblinName,
    'add-ref',
    function*(quest, path, entityId, remote, beforeId) {
      const entity = quest.goblin.getState();
      //avoid change archives
      if (entity.get('meta.status') === 'archived') {
        console.warn('Trying to mutate an archived document ', quest.goblin.id);
        return;
      }
      const existing = quest.goblin
        .getState()
        .get(path)
        .includes(entityId);
      if (existing) {
        return;
      }
      quest.do();
      const refSubs = quest.goblin.getX('refSubs');
      const desktopId = quest.getDesktop();

      //Add a ref for us too
      yield quest.create(entityId, {
        id: entityId,
        desktopId,
        loadedBy: quest.goblin.id,
      });

      if (!refSubs[entityId]) {
        refSubs[entityId] = [];
      }

      const id = entity.get('id');
      const rootAggregateId = entity.get('meta.rootAggregateId');
      const rootAggregatePath = entity.get('meta.rootAggregatePath').toArray();
      const hydrator = requestHydrate(
        desktopId,
        id,
        rootAggregateId,
        rootAggregatePath
      );
      refSubs[entityId].push(quest.sub(`*::${entityId}.changed`, hydrator));

      quest.goblin.setX('refSubs', refSubs);
      quest.evt('collection-changed', {eventType: 'added', entityId, beforeId});

      if (!remote) {
        yield quest.me.reHydrateSync();
      }
    },
    ['*::*.changed']
  );

  Goblin.registerQuest(goblinName, 'add-new-val', function*(
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
    const desktopId = quest.getDesktop();
    const agg = common.getAggregationInfo(quest);
    const newEntityId = `${type}@${quest.uuidV4()}`;
    const newEntity = yield quest.create(
      newEntityId,
      Object.assign(
        {
          id: newEntityId,
          desktopId,
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
    return newEntityId;
  });

  Goblin.registerQuest(
    goblinName,
    'copy-collection-by-value',
    function*(quest, path, entityIds, entities, deepCopy, next) {
      const entity = quest.goblin.getState();
      //avoid change archives
      if (entity.get('meta.status') === 'archived') {
        console.warn('Trying to mutate an archived document ', quest.goblin.id);
        return;
      }

      const desktopId = quest.getDesktop();
      const agg = common.getAggregationInfo(quest);
      if (!entityIds[0]) {
        return;
      }
      const type = entityIds[0].split('@')[0];
      const copyMapping = {};
      for (const entityId of entityIds) {
        const toCopy = entities.get(entityId);
        const newEntityId = `${type}@${quest.uuidV4()}`;
        const payload = {
          id: newEntityId,
          copyId: entityId,
          copyEntity: toCopy,
          copyDeep: deepCopy,
          desktopId,
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
      const rootAggregatePath = entity.get('meta.rootAggregatePath').toArray();
      const hydrator = requestHydrate(
        desktopId,
        entityId,
        rootAggregateId,
        rootAggregatePath
      );
      for (const newEntityAPI of newEntityAPIs) {
        const newEntityId = newEntityAPI.id;
        const valSubs = quest.goblin.getX('valSubs');
        if (!valSubs[newEntityId]) {
          valSubs[newEntityId] = [];
        }

        valSubs[newEntityId].push(
          quest.sub(`*::${newEntityId}.changed`, hydrator)
        );

        quest.goblin.setX('valSubs', valSubs);
        quest.evt('collection-changed', {
          eventType: 'added',
          entityId: newEntityId,
          beforeId: null,
        });
      }

      yield quest.me.reHydrateSync();
    },
    ['*::*.changed']
  );

  Goblin.registerQuest(goblinName, 'add-copy-val', function*(
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

    const desktopId = quest.getDesktop();
    const agg = common.getAggregationInfo(quest);
    const newEntityId = `${type}@${quest.uuidV4()}`;
    const payload = {
      id: newEntityId,
      copyId: entityId,
      copyEntity: toCopy,
      copyDeep: deepCopy,
      desktopId,
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
    return newEntityId;
  });

  Goblin.registerQuest(goblinName, 'add-copy-ref', function*(
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

    const desktopId = quest.getDesktop();
    const agg = common.getAggregationInfo(quest);
    const newEntityId = `${type}@${quest.uuidV4()}`;
    const payload = {
      id: newEntityId,
      copyId: entityId,
      copyEntity: toCopy,
      copyDeep: deepCopy,
      desktopId,
      loadedBy: quest.goblin.id,
      parentEntity: quest.goblin.id,
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
    return newEntityId;
  });

  Goblin.registerQuest(goblinName, 'copy-values', function*(
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
      const entityIds = entity.get(path).toArray();
      if (entityIds[0]) {
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

  Goblin.registerQuest(
    goblinName,
    'add-val',
    function*(quest, path, entity, remote, beforeId) {
      const state = quest.goblin.getState();
      //avoid change archives
      if (state.get('meta.status') === 'archived') {
        console.warn('Trying to mutate an archived document ', quest.goblin.id);
        return;
      }

      const desktopId = quest.getDesktop();
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
        entity
          .get('meta.rootAggregatePath')
          .toArray()
          .join('/') !== aggregateInfo.rootAggregatePath.join('/')
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

      yield quest.create(entityId, {
        id: entityId,
        desktopId,
        entity,
        status: quest.goblin.getState().get('meta.status'),
        parentEntity: entity.get('meta.parentEntity'),
        rootAggregateId: entity.get('meta.rootAggregateId'),
        rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
        loadedBy: quest.goblin.id,
      });

      if (!valSubs[entityId]) {
        valSubs[entityId] = [];
      }

      const id = state.get('id');
      const rootAggregateId = state.get('meta.rootAggregateId');
      const rootAggregatePath = state.get('meta.rootAggregatePath').toArray();
      const hydrator = requestHydrate(
        desktopId,
        id,
        rootAggregateId,
        rootAggregatePath
      );
      valSubs[entityId].push(quest.sub(`*::${entityId}.changed`, hydrator));

      quest.goblin.setX('valSubs', valSubs);
      quest.evt('collection-changed', {eventType: 'added', entityId, beforeId});

      if (!remote) {
        yield quest.me.reHydrateSync();
      }

      return entityId;
    },
    ['*::*.changed']
  );

  Goblin.registerQuest(goblinName, 'move-ref', function*(
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
    yield rehydrateAndEmit(quest, 'collection-changed', {
      eventType: 'moved',
      entityId,
      beforeEntityId,
    });
  });

  Goblin.registerQuest(goblinName, 'move-val', function*(
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
    yield rehydrateAndEmit(quest, 'collection-changed', {
      eventType: 'moved',
      entityId,
      beforeEntityId,
    });
  });

  Goblin.registerQuest(goblinName, 'remove-ref', function*(
    quest,
    path,
    entityId,
    remote
  ) {
    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
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
    yield quest.kill([entityId]);
    quest.evt('collection-changed', {eventType: 'removed', entityId});
    if (!remote) {
      yield quest.me.reHydrateSync();
    }
  });

  Goblin.registerQuest(goblinName, 'remove-val', function*(
    quest,
    path,
    entityId,
    remote
  ) {
    const state = quest.goblin.getState();
    //avoid change archives
    if (state.get('meta.status') === 'archived') {
      console.warn('Trying to mutate an archived document ', quest.goblin.id);
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
        mustExist: true,
      });
      yield toRemoveAPI.hardDeleteEntity();
    } finally {
      yield quest.kill([entityId]);
    }
    quest.evt('collection-changed', {eventType: 'removed', entityId});

    if (!remote) {
      yield quest.me.reHydrateSync();
    }
  });

  Goblin.registerQuest(
    goblinName,
    'set-ref',
    function*(quest, path, entityId, remote) {
      const state = quest.goblin.getState();
      //avoid change archives
      if (state.get('meta.status') === 'archived') {
        console.warn('Trying to mutate an archived document ', quest.goblin.id);
        return;
      }

      const refSubs = quest.goblin.getX('refSubs');
      const desktopId = quest.getDesktop();

      const useKey = entityId;

      yield quest.create(useKey, {
        id: entityId,
        desktopId,
        loadedBy: quest.goblin.id,
      });

      if (!refSubs[entityId]) {
        refSubs[entityId] = [];
      }

      const id = state.get('id');
      const rootAggregateId = state.get('meta.rootAggregateId');
      const rootAggregatePath = state.get('meta.rootAggregatePath').toArray();
      const hydrator = requestHydrate(
        desktopId,
        id,
        rootAggregateId,
        rootAggregatePath
      );
      refSubs[entityId].push(quest.sub(`*::${entityId}.changed`, hydrator));

      quest.goblin.setX('refSubs', refSubs);
      quest.do();
      quest.evt('ref-setted');

      if (!remote) {
        yield quest.me.reHydrateSync();
      }
    },
    ['*::*.changed']
  );

  Goblin.registerQuest(
    goblinName,
    'set-val',
    function*(quest, path, entity, remote) {
      const state = quest.goblin.getState();
      //avoid change archives
      if (state.get('meta.status') === 'archived') {
        console.warn('Trying to mutate an archived document ', quest.goblin.id);
        return;
      }

      const valSubs = quest.goblin.getX('valSubs');
      const desktopId = quest.getDesktop();

      const useKey = entity.id;

      yield quest.create(useKey, {
        id: entity.id,
        desktopId,
        entity,
        parentEntity: entity.meta.parentEntity,
        rootAggregateId: entity.meta.rootAggregateId,
        rootAggregatePath: entity.meta.rootAggregatePath,
        loadedBy: quest.goblin.id,
      });

      if (!valSubs[entity.id]) {
        valSubs[entity.id] = [];
      }

      const entityId = state.get('id');
      const rootAggregateId = state.get('meta.rootAggregateId');
      const rootAggregatePath = state.get('meta.rootAggregatePath').toArray();
      const hydrator = requestHydrate(
        desktopId,
        entityId,
        rootAggregateId,
        rootAggregatePath
      );

      valSubs[entity.id].push(quest.sub(`*::${entity.id}.changed`, hydrator));

      quest.goblin.setX('valSubs', valSubs);
      quest.do();
      quest.evt('val-setted');

      if (!remote) {
        yield quest.me.reHydrateSync();
      }
    },
    ['*::*.changed']
  );

  Goblin.registerQuest(goblinName, 'persist', function*(quest, ripley) {
    const state = quest.goblin.getState();
    const oldState = quest.goblin.getX('oldState');

    if (oldState && state.equals(oldState)) {
      quest.log.info(`skip persist ${state.get('id')}`);
      return;
    }
    quest.log.info(`persist ${state.get('id')}`);
    quest.goblin.setX('oldState', state);

    const entity = state.toJS();
    if (!entity) {
      throw new Error('Fatal...');
    }
    //remove backup's
    // recursiveley

    const cleanPrivate = entity => {
      if (entity.private) {
        if (entity.private.backup) {
          delete entity.private.backup;
        }
        for (const values of Object.keys(entity.private)) {
          for (const id of Object.keys(entity.private[values])) {
            if (id) {
              cleanPrivate(entity.private[values][id]);
            }
          }
        }
      }
    };

    cleanPrivate(entity);

    const desktopId = quest.getDesktop();
    entity.meta.persistedFromDesktopId = desktopId;

    const agg = common.getAggregationInfo(quest);
    const rootAggregateId = agg.rootAggregateId;
    const r = quest.getStorage('rethink');

    yield r.set({
      table: type,
      documents: entity,
    });

    if (rootAggregateId !== entity.id) {
      const rootType = rootAggregateId.split('@')[0];
      const rootAggregatePath = agg.rootAggregatePath;
      delete entity.meta.persistedFromDesktopId;
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
    Goblin.registerQuest(goblinName, 'build-summaries', function*(
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
          summaries[k] = v.toJS();
        }
      });
      quest.do({summaries});
      quest.evt('described');
    });
  }

  if (indexer) {
    Goblin.registerQuest(goblinName, 'index', function*(
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

      doc.status = entity.get('meta.status');
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

    Goblin.registerQuest(goblinName, 'set-index', function*(quest, docId, doc) {
      const multiLanguageDoc = yield buildMultiLanguageSummaries(
        quest,
        doc,
        true
      );
      const mandate = quest.getSession();
      const body = Object.entries(multiLanguageDoc).reduce(
        (body, [locale, doc]) => {
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
          return body;
        },
        []
      );

      const e = quest.getStorage('elastic');
      yield e.bulk({body});
      quest.evt('indexed');
    });
  }

  if (references) {
    Object.keys(references).forEach(path => {
      Goblin.registerQuest(goblinName, `fetch-${path}`, function*(quest) {
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
    Object.keys(values).forEach(path => {
      Goblin.registerQuest(goblinName, `fetch-${path}`, function(quest) {
        const peers = {};
        const entity = quest.goblin.getState();
        fetchValues(quest, peers, entity, new Goblin.Shredder(values), path);
        return peers[Object.keys(peers)[0]];
      });
    });
  }

  if (computer) {
    Goblin.registerQuest(goblinName, 'compute', function*(
      quest,
      entity,
      peers,
      next
    ) {
      if (!entity) {
        entity = quest.goblin.getState();
      }

      // FIXME: should be removed (business)
      let sums = {
        base: new BigNumber(0),
        cost: new BigNumber(0),
        reward: new BigNumber(0),
      };
      if (peers) {
        Object.keys(peers)
          .filter(type => Array.isArray(peers[type]))
          .forEach(type => {
            const subSums = peers[type];
            Object.keys(sums).forEach(sum => {
              if (!sums[sum]) {
                sums[sum] = new BigNumber(0);
              }
              sums[sum] = sums[sum].plus(
                subSums.reduce((p, c) => {
                  if (c.get('sums')) {
                    if (!c.get(`sums.${sum}`)) {
                      c = c.set(`sums.${sum}`, new BigNumber(0));
                    }
                    return p.plus(c.get(`sums.${sum}`));
                  } else {
                    return p;
                  }
                }, new BigNumber(0))
              );
            });
          });
      }

      //Inject bignumber as N for computer
      sums.N = BigNumber;
      if (common.isGenerator(computer)) {
        sums = yield* computer(quest, sums, entity, peers, next);
      } else {
        sums = computer(quest, sums, entity, peers);
      }
      quest.do({sums});
      quest.evt('computed');
    });
  }

  // Dispose subscriptions and notify services of disposition...
  const dispose = quest => {
    let subs = quest.goblin.getX('refSubs');
    if (subs) {
      Object.keys(subs).forEach(s => {
        for (const unsub of subs[s]) {
          unsub();
        }
      });
    }

    subs = quest.goblin.getX('valSubs');
    if (subs) {
      Object.keys(subs).forEach(s => {
        for (const unsub of subs[s]) {
          unsub();
        }
      });
    }

    const parentUnsub = quest.goblin.getX('parentSub');
    if (parentUnsub) {
      parentUnsub();
    }

    delete lastChangedHashes[quest.goblin.id];

    quest.evt('disposed');
  };

  /////////////////////////////////////////////////////////////////
  // <Entity flow builder>
  const buildEntityFlowPropagator = (verb, evt) => {
    const questName = `${verb}-entity`;
    common.registerQuests(
      goblinName,
      {
        [questName]: function*(quest, next) {
          const document = quest.goblin.getState();
          quest.defer(
            quest.sub(`*::${document.get('id')}.${evt}`, next.parallel())
          );
          quest.evt(`${document.get('id')}.${verb}-requested`, {
            desktopId: quest.getDesktop(),
            verb,
            entity: document,
            requestedBy: quest.goblin.getX('_goblinCaller'),
          });
          //cascade sub-documents
          const traverseValues = subDoc => {
            const values = subDoc.get('meta.values');
            if (values) {
              for (const path of values.keys()) {
                const entityIds = subDoc.get(path);
                if (entityIds) {
                  for (const entityId of entityIds.values()) {
                    const entity = subDoc.get(`private.${path}.${entityId}`);
                    if (entity) {
                      traverseValues(entity);
                      quest.defer(
                        quest.sub(
                          `*::${entity.get('id')}.${evt}`,
                          next.parallel()
                        )
                      );
                      quest.evt(`${entity.get('id')}.${verb}-requested`, {
                        desktopId: quest.getDesktop(),
                        verb,
                        entity,
                        requestedBy: quest.goblin.getX('_goblinCaller'),
                      });
                    }
                  }
                }
              }
            }
          };
          traverseValues(document);
          yield next.sync();
          quest.evt(`entity-${evt}`);
        },
      },
      [`*::*.${evt}`]
    );
  };

  buildEntityFlowPropagator('publish', 'published');
  buildEntityFlowPropagator('restore', 'restored');
  buildEntityFlowPropagator('archive', 'archived');
  buildEntityFlowPropagator('trash', 'trashed');

  const entityFlowQuests = {
    publish: function*(quest) {
      const document = quest.goblin.getState();

      //skip quest if already published
      if (document.get('meta.status') === 'published') {
        quest.evt('published');
        return;
      }

      //set published
      quest.do();

      if (onPublish) {
        yield quest.me.onPublish();
      }
      yield quest.me.reHydrateSync();
      quest.evt('published');
    },
    archive: function*(quest) {
      const document = quest.goblin.getState();

      //skip quest if already archived
      if (document.get('meta.status') === 'archived') {
        quest.evt('archived');
        //avoid unecessary upsert by canceling
        return quest.cancel();
      }

      //avoid archiving draft
      if (document.get('meta.status') === 'draft') {
        quest.evt('archived');
        return quest.cancel();
      }

      //set archived
      quest.do();

      if (onArchive) {
        yield quest.me.onArchive();
      }
      quest.evt('archived');
      yield quest.me.reHydrateSync();
    },
    trash: function*(quest) {
      const document = quest.goblin.getState();

      //skip quest if already archived
      if (document.get('meta.status') === 'trashed') {
        quest.evt('trashed');
        //avoid unecessary upsert by canceling
        return quest.cancel();
      }

      //set trashed
      quest.do();

      if (onTrash) {
        yield quest.me.onTrash();
      }
      quest.evt('trashed');
      yield quest.me.reHydrateSync();
    },
    restore: function*(quest) {
      const document = quest.goblin.getState();
      const backup = document.get('private.backup', null);
      const entity = document.del('private.backup');
      if (backup && entity.equals(backup)) {
        quest.evt('restored');
        return;
      }
      //rollback
      quest.do();
      quest.evt('restored');
      yield quest.me.reHydrateSync();
    },
  };

  common.registerQuests(goblinName, entityFlowQuests);

  // </Entity flow builder>
  /////////////////////////////////////////////////////////////////////

  Goblin.registerQuest(goblinName, 'hard-delete-entity', function(quest) {
    dispose(quest);

    const document = quest.goblin.getState().toJS();
    quest.evt('hard-deleted', {
      document,
    });

    //cascade delete sub-documents
    const subDelete = subDoc => {
      for (const path in subDoc.meta.values) {
        for (const entityId of subDoc[path]) {
          const toDelete = subDoc.private[path][entityId];
          if (toDelete) {
            subDelete(toDelete);
            quest.evt('hard-deleted', {
              document: toDelete,
            });
          }
        }
      }
    };
    subDelete(document);
  });

  Goblin.registerQuest(goblinName, 'delete', function(quest) {
    dispose(quest);
  });

  // Create a Goblin with initial state and handlers
  return Goblin.configure(goblinName, logicState, logicHandlers, goblinConfig);
}

builder.entities = types;
builder.indexes = indexes;
builder.customIndexesByType = customIndexesByType;
builder.configurations = configs;
module.exports = builder;
