'use strict';
const _ = require('lodash');
const watt = require('gigawatts');
const Goblin = require('xcraft-core-goblin');
const xUtils = require('xcraft-core-utils');
const entityMeta = require('./entity-meta');
const common = require('./workitems/common.js');
const BigNumber = require('bignumber.js');
const MarkdownBuilder = require('./markdown-builder.js');
const {
  buildPeers,
  fetchValues,
  fetchPeers,
} = require('./entity-builder/peers.js');

const {
  buildReferencesQuests,
  buildValuesQuests,
} = require('./entity-builder/methods.js');

const types = [];
const indexes = [];
const configs = {};

function builder(config) {
  const {
    name,
    type,
    references,
    values,
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
    cacheSize,
    //enableHistory,
  } = config;

  let goblinName = type;
  types.push(type);
  configs[type] = config;

  if (indexer) {
    indexes.push(type);
  }

  if (name) {
    goblinName = name;
  }

  const cacheConfig = {
    cacheSize: cacheSize || 100,
  };

  const logicState = {};

  const ripleyConfig = {
    persist: {
      mode: 'all',
    },
  };

  let lastChangedState = {};

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

  const rehydrateAndEmit = watt(function*(quest, verb, payload) {
    quest.evt(verb, payload);
    yield quest.me.reHydrateSync();
  });

  const requestHydrate = quest => muteChanged => {
    quest.evt('hydrate-entity-requested', {
      desktopId: quest.getDesktop(),
      entity: quest.goblin.getState(),
      muteChanged,
    });
  };

  Goblin.registerQuest(goblinName, 'create', function*(
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

    const notifier = quest => {
      console.log(`${quest.goblin.id} changed`);
      quest.evt('changed', {id: quest.goblin.id});
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
        entity = yield r.get({table: type, documentId: copyId});
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
        entity = yield r.get({table: type, documentId: id});
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
        const err = new Error('Entity not found');
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

      r.set({
        table: type,
        documents: entity.toJS(),
      });

      if (rootAggregateId !== entity.get('id')) {
        const rootType = rootAggregateId.split('@')[0];
        entity = entity.del('meta.persistedFromDesktopId');
        r.setIn({
          table: rootType,
          documentId: rootAggregateId,
          path: rootAggregatePath,
          value: entity.toJS(),
        });
      }
    }

    quest.goblin.setX('isNew', isNew);

    common.createWaitLoader(quest);

    quest.goblin.setX(
      'unsubCreated',
      quest.sub(`${quest.goblin.id}.created`, quest.me.afterCreate)
    );

    quest.do({entity});

    //backup 'at load' state
    const freshEntity = quest.goblin.getState();
    quest.dispatch('backup', {entity: freshEntity});

    return quest.goblin.id;
  });

  Goblin.registerQuest(goblinName, 'after-create', function*(quest) {
    const unsub = quest.goblin.getX('unsubCreated');
    if (!unsub(true)) {
      /* HACK: skip second .created event, see the same hack in workitem.js. */
      return;
    }

    const entity = quest.goblin.getState();
    const valSubs = quest.goblin.getX('valSubs');
    const refSubs = quest.goblin.getX('refSubs');
    const isNew = quest.goblin.getX('isNew');
    const hydrator = requestHydrate(quest);

    if (!entity) {
      return quest.cancel();
    }

    //LISTEN SELF CHANGES
    //quest.goblin.defer(quest.sub(`*::${quest.goblin.id}.changed`, hydrator));

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
        yield quest.me.afterNew({entity});
      }
      yield quest.me.reHydrateSync();
    }
    quest.evt('loaded');
  });

  Goblin.registerQuest(goblinName, 'wait-loaded', common.waitLoadedQuest);
  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);
  Goblin.registerQuest(goblinName, 'get-entities', common.getEntitiesQuest);
  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  // Load graph
  Goblin.registerQuest(goblinName, 'load-graph', function*(
    quest,
    level,
    stopAtLevel,
    skipped,
    next
  ) {
    const desktopId = quest.goblin.getX('desktopId');
    const entity = quest.goblin.getState();

    const extractEntityId = msg => msg.data.entityId;
    const extractType = msg =>
      msg.data.type ? msg.data.type : msg.data.entityId.split('@')[0];
    const handleType = msg => !skipped.includes(extractType(msg));

    const handleCollectionChanged = (err, msg) => {
      if (handleType(msg)) {
        const {eventType} = msg.data;
        const entityId = extractEntityId(msg);
        switch (eventType) {
          case 'added':
            quest.create(entityId, {
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
            quest.kill([entityId]);
            break;
        }
      }
    };

    const loadGraph = (items, isVal, lvl, stopAt, skipped, peers) => {
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
            quest.create(rId, payload, next.parallel());
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
            quest.create(rId, payload, next.parallel());
          }
        }
      }
    };

    if (level <= stopAtLevel) {
      //SUBSCRIBE TO COLLECTION CHANGED
      quest.goblin.defer(
        quest.sub(
          `*::${quest.goblin.id}.collection-changed`,
          handleCollectionChanged
        )
      );
      const peers = yield buildPeers(quest, entity);
      if (entity.get('meta.references')) {
        loadGraph(
          entity.get('meta.references').toJS(),
          false,
          level,
          stopAtLevel,
          skipped,
          peers
        );
      }

      if (entity.get('meta.values')) {
        loadGraph(
          entity.get('meta.values').toJS(),
          true,
          level,
          stopAtLevel,
          skipped,
          peers
        );
      }
      const entitiesAPI = yield next.sync();
      if (entitiesAPI) {
        for (const api of entitiesAPI.values()) {
          api.loadGraph(
            {
              level: level + 1,
              stopAtLevel: stopAtLevel,
              skipped,
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
    if (muteChanged) {
      return false;
    }
    const notifyChanged = quest.goblin.getX('notifyChanged');
    if (!notifyChanged) {
      quest.log.warn('Entity is unloaded while notify-changed is called...');
      return false;
    }

    if (!lastChangedState[quest.goblin.id]) {
      lastChangedState[quest.goblin.id] = quest.goblin.getState();
      notifyChanged(quest);
      return true;
    }

    const currentState = quest.goblin.getState();
    if (currentState.equals(lastChangedState[quest.goblin.id])) {
      return false;
    }
    notifyChanged(quest);
    lastChangedState[quest.goblin.id] = currentState;
    return true;
  });

  Goblin.registerQuest(goblinName, 'hydrate', function*(
    quest,
    muteChanged,
    next
  ) {
    try {
      let entity = quest.goblin.getState();
      const lastHydrate = quest.goblin.getX('lastHydrate');
      let peers = null;

      if (references || values) {
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
        if (buildSummaries) {
          quest.me.buildSummaries({entity, peers}, next.parallel());
        }

        try {
          if (computer) {
            quest.me.compute({entity, peers}, next.parallel());
          }

          yield next.sync();

          entity = quest.goblin.getState();
          try {
            if (indexer) {
              yield quest.me.index({entity, peers});
            }
          } catch (ex) {
            quest.fail(
              `Erreur lors de l'hydratation`,
              `problème dans l'indexeur`,
              `voir message d'ex.`,
              ex.stack || ex.message || ex
            );
            throw ex;
          }

          const changed = yield quest.me.notifyChanged({muteChanged});
          if (changed) {
            if (entity.get('meta.rootAggregateId') !== quest.goblin.id) {
              const parentId = entity.get('meta.parentEntity');
              quest.evt('update-aggregate-requested', {
                parentId,
                desktopId: quest.getDesktop(),
                entity,
              });
            }

            if (hydratePeers) {
              hydratePeers
                .filter(peerKey => !!peers[peerKey])
                .map(peerKey => peers[peerKey])
                .forEach(peer => {
                  const entities = Array.isArray(peer) ? peer : [peer];
                  entities.forEach(entity => {
                    quest.evt('hydrate-entity-requested', {
                      desktopId: quest.getDesktop(),
                      entity,
                      muteChanged: true,
                    });
                  });
                });
            }
          }
        } catch (ex) {
          quest.fail(
            `Erreur lors de l'hydratation`,
            `problème dans le calculateur`,
            `voir message d'ex.`,
            ex.stack || ex.message || ex
          );
          throw ex;
        }
      } catch (ex) {
        quest.fail(
          `Erreur lors de l'hydratation`,
          `problème dans les summaries`,
          `voir message d'ex.`,
          ex.stack || ex.message || ex
        );
        throw ex;
      }
    } catch (ex) {
      quest.fail(
        `Erreur lors de l'hydratation`,
        `problème de construction du graph`,
        `voir avec Sam`,
        ex.stack || ex.message || ex
      );
      throw ex;
    }

    quest.evt('hydrated');
  });

  Goblin.registerQuest(goblinName, 'change', function*(quest, path, newValue) {
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

    quest.do();

    yield quest.me.reHydrateSync();
  });

  Goblin.registerQuest(goblinName, 'update-aggregate', function*(
    quest,
    entity
  ) {
    quest.do();
    yield quest.me.reHydrateSync();
  });

  Goblin.registerQuest(goblinName, 're-hydrate', function(quest, muteChanged) {
    quest.evt('hydrate-entity-requested', {
      desktopId: quest.getDesktop(),
      entity: quest.goblin.getState(),
      muteChanged,
    });
  });

  Goblin.registerQuest(goblinName, 're-hydrate-sync', function*(
    quest,
    muteChanged,
    rebuild
  ) {
    quest.evt('hydrate-entity-requested', {
      desktopId: quest.getDesktop(),
      entity: quest.goblin.getState(),
      muteChanged,
      rebuild,
    });
    yield quest.sub.wait(`*::${quest.goblin.id}.hydrated`);
  });

  Goblin.registerQuest(goblinName, 'rebuild', function*(quest) {
    //rebuild values
    const toCheck = {};
    const entity = quest.goblin.getState();
    const values = entity.get('meta.values');
    for (const path of values.keys()) {
      fetchValues(quest, toCheck, entity, values, path, true);
    }
    for (const values of Object.values(toCheck)) {
      for (const entity of Object.values(values)) {
        const entityId = entity.get('id');
        try {
          yield quest.create(entityId, {
            id: entityId,
            desktopId: quest.getDesktop(),
            mustExist: true,
          });
        } catch (err) {
          console.log('REBUILDING: ', entityId);
          const revivedAPI = yield quest.create(entityId, {
            id: entityId,
            desktopId: quest.getDesktop(),
            entity,
          });
          yield revivedAPI.persist();
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
    yield quest.me.persist({ripley: true});
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
    sync
  ) {
    quest.do();
    if (!sync) {
      yield quest.me.reHydrate({muteChanged});
    } else {
      yield quest.me.reHydrateSync({muteChanged});
    }
  });

  Goblin.registerQuest(goblinName, 'get', function(quest) {
    return quest.goblin.getState();
  });

  Goblin.registerQuest(goblinName, 'copy-collection-by-ref', function*(
    quest,
    path,
    entityIds,
    next
  ) {
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

      const hydrator = requestHydrate(quest);
      refSubs[entityId].push(quest.sub(`*::${entityId}.changed`, hydrator));

      quest.goblin.setX('refSubs', refSubs);
      quest.evt('collection-changed', {eventType: 'added', entityId});
    }
    yield next.sync();
    yield quest.me.reHydrateSync();
  });

  Goblin.registerQuest(goblinName, 'add-ref', function*(
    quest,
    path,
    entityId,
    remote,
    beforeId
  ) {
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

    const hydrator = requestHydrate(quest);
    refSubs[entityId].push(quest.sub(`*::${entityId}.changed`, hydrator));

    quest.goblin.setX('refSubs', refSubs);
    quest.evt('collection-changed', {eventType: 'added', entityId, beforeId});

    if (!remote) {
      yield quest.me.reHydrateSync();
    }
  });

  Goblin.registerQuest(goblinName, 'add-new-val', function*(
    quest,
    path,
    type,
    payload,
    parentEntity,
    beforeId
  ) {
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
    const entity = yield newEntity.get();
    yield quest.me.addVal({path, entity: entity, beforeId});
    return newEntityId;
  });

  Goblin.registerQuest(goblinName, 'copy-collection-by-value', function*(
    quest,
    path,
    entityIds,
    entities,
    deepCopy,
    next
  ) {
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

    next.parallel()();
    const hydrator = requestHydrate(quest);
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

    yield next.sync();
    yield quest.me.reHydrateSync();
  });

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
      entity = yield quest.me.getEntity({entityId});
    } else {
      entity = new Goblin.Shredder(entity);
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

  Goblin.registerQuest(goblinName, 'add-val', function*(
    quest,
    path,
    entity,
    remote,
    beforeId
  ) {
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

    const addedEntityAPI = yield quest.create(entityId, {
      id: entityId,
      desktopId,
      entity,
      status: quest.goblin.getState().get('meta.status'),
      parentEntity: entity.get('meta.parentEntity'),
      rootAggregateId: entity.get('meta.rootAggregateId'),
      rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
      loadedBy: quest.goblin.id,
    });

    yield addedEntityAPI.apply({patch: entity});

    if (!valSubs[entityId]) {
      valSubs[entityId] = [];
    }

    const hydrator = requestHydrate(quest);
    valSubs[entityId].push(quest.sub(`*::${entityId}.changed`, hydrator));

    quest.goblin.setX('valSubs', valSubs);
    quest.evt('collection-changed', {eventType: 'added', entityId, beforeId});

    if (!remote) {
      yield quest.me.reHydrateSync();
    }

    return entityId;
  });

  Goblin.registerQuest(goblinName, 'move-ref', function*(
    quest,
    path,
    entityId,
    beforeEntityId
  ) {
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
    const refSubs = quest.goblin.getX('refSubs');
    if (refSubs[entityId]) {
      for (const unsub of refSubs[entityId]) {
        unsub();
      }
      delete refSubs[entityId];
      quest.goblin.setX('refSubs', refSubs);
    }

    quest.do();
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
    const valSubs = quest.goblin.getX('valSubs');
    if (valSubs[entityId]) {
      for (const unsub of valSubs[entityId]) {
        unsub();
      }
      delete valSubs[entityId];
      quest.goblin.setX('valSubs', valSubs);
    }

    quest.do();
    quest.evt('collection-changed', {eventType: 'removed', entityId});

    if (!remote) {
      yield quest.me.reHydrateSync();

      const valueAPI = quest.getAPI(entityId);
      if (valueAPI) {
        yield valueAPI.deleteEntity();
      }
    }
  });

  Goblin.registerQuest(goblinName, 'set-ref', function*(
    quest,
    path,
    entityId,
    remote
  ) {
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

    const hydrator = requestHydrate(quest);
    refSubs[entityId].push(quest.sub(`*::${entityId}.changed`, hydrator));

    quest.goblin.setX('refSubs', refSubs);
    quest.do();
    quest.evt('ref-setted');

    if (!remote) {
      yield quest.me.reHydrateSync();
    }
  });

  Goblin.registerQuest(goblinName, 'set-val', function*(
    quest,
    path,
    entity,
    remote
  ) {
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

    const hydrator = requestHydrate(quest);
    valSubs[entity.id].push(quest.sub(`*::${entity.id}.changed`, hydrator));

    quest.goblin.setX('valSubs', valSubs);
    quest.do();
    quest.evt('val-setted');

    if (!remote) {
      yield quest.me.reHydrateSync();
    }
  });

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
          next
        );
      } else {
        summaries = buildSummaries(quest, entity, peers, new MarkdownBuilder());
      }
      Object.keys(summaries).forEach(k => {
        if (summaries[k] === undefined) {
          throw new Error(
            `Bad summaries returned for ${type}
            check buildSummaries, especialy the ${k} props.`
          );
        }
      });

      quest.do({summaries});
      quest.evt('described');
    });
  }

  if (afterNew) {
    Goblin.registerQuest(goblinName, 'after-new', function*(
      quest,
      entity,
      next
    ) {
      if (!entity) {
        entity = quest.goblin.getState();
      } else {
        entity = new Goblin.Shredder(entity);
      }
      const desktopId = quest.getDesktop();
      if (common.isGenerator(afterNew)) {
        yield* afterNew(quest, desktopId, entity, next);
      } else {
        afterNew(quest, desktopId, entity);
      }
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
        doc = yield* indexer(quest, entity, peers, new MarkdownBuilder(), next);
      } else {
        doc = indexer(quest, entity, peers, new MarkdownBuilder());
      }

      doc.status = entity.get('meta.status');

      quest.do({document: doc});
      yield quest.me.setIndex({
        docId: entity.get('id'),
        doc,
      });
    });

    Goblin.registerQuest(goblinName, 'set-index', function(quest, docId, doc) {
      if (doc.info) {
        doc.searchAutocomplete = doc.info;
        doc.searchPhonetic = doc.info;
      }

      const index = {
        documentId: docId,
        type,
        document: doc,
      };

      const e = quest.getStorage('elastic');
      e.index(index);

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

    delete lastChangedState[quest.goblin.id];

    quest.evt('disposed');
  };

  /////////////////////////////////////////////////////////////////
  // <Entity flow builder>
  const buildEntityFlowPropagator = (verb, evt) => {
    const questName = `${verb}-entity`;
    common.registerQuests(goblinName, {
      [questName]: function*(quest, next) {
        const document = quest.goblin.getState();
        quest.defer(
          quest.sub(`*::${document.get('id')}.${evt}`, next.parallel())
        );
        quest.evt(`${document.get('id')}.${verb}-requested`, {
          desktopId: quest.getDesktop(),
          verb,
          entity: document,
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
    });
  };

  buildEntityFlowPropagator('publish', 'published');
  buildEntityFlowPropagator('restore', 'restored');
  buildEntityFlowPropagator('archive', 'archived');

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

  Goblin.registerQuest(goblinName, 'delete-entity', function(quest) {
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
  return Goblin.configure(
    goblinName,
    logicState,
    logicHandlers,
    ripleyConfig,
    cacheConfig
  );
}

builder.entities = types;
builder.indexes = indexes;
builder.configurations = configs;
module.exports = builder;
