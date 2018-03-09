'use strict';
const _ = require('lodash');
const Goblin = require('xcraft-core-goblin');
const xUtils = require('xcraft-core-utils');
const entityMeta = require('./entity-meta');
const common = require('./workitems/common.js');
const BigNumber = require('bignumber.js');
const MarkdownBuilder = require('./markdownBuilder.js');

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

// Build peers entity collections from references and values
const buildPeers = function*(quest, entity) {
  const peers = {};
  const references = entity.meta.references;
  const values = entity.meta.values;
  if (references) {
    for (const path in references) {
      yield* fetchPeers(quest, peers, entity, references, path, false);
    }
  }

  if (values) {
    for (const path in values) {
      fetchValues(quest, peers, entity, values, path, true);
    }
  }

  if (entity.meta.parentEntity && entity.meta.parentEntity !== null) {
    const parent = yield quest.me.getEntity({
      entityId: entity.meta.parentEntity,
    });
    peers.parent = parent;
  }
  return peers;
};

const fetchValues = function(quest, peers, entity, values, path, usePathAsKey) {
  const val = values[path];
  const type = common.getReferenceType(val);
  const peerKey = usePathAsKey ? path : type;
  if (common.referenceUseArity(val)) {
    if (!peers[peerKey]) {
      peers[peerKey] = [];
    }
    for (const rId of entity[path]) {
      const peer = entity.private[path][rId];
      peers[peerKey].push(peer);
    }
  } else {
    //Entity case
    const rId = entity[path];
    if (rId) {
      const peer = entity.private[path][rId];
      peers[peerKey] = peer;
    } else {
      peers[peerKey] = null;
    }
  }
};

const fetchPeers = function*(
  quest,
  peers,
  entity,
  references,
  path,
  usePathAsKey
) {
  const ref = references[path];
  const type = common.getReferenceType(ref);
  const peerKey = usePathAsKey ? path : type;
  if (common.referenceUseArity(ref)) {
    if (!peers[peerKey]) {
      peers[peerKey] = [];
    }
    for (const rId of entity[path]) {
      const peer = yield quest.me.getEntity({entityId: rId});
      peers[peerKey].push(peer);
    }
  } else {
    //Entity case
    const rId = entity[path];
    if (rId) {
      const peer = yield quest.me.getEntity({entityId: rId});
      peers[peerKey] = peer;
    } else {
      peers[peerKey] = null;
    }
  }
};

const types = [];

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
    indexer,
    computer,
    updateOnParentChange,
    newEntityStatus,
    //enableHistory,
  } = config;

  let goblinName = type;
  types.push(type);

  if (name) {
    goblinName = name;
  }

  const getHistory = quest => {
    return quest.goblin.getState().toJS();
  };

  // Define initial logic values
  const logicState = {};

  const ripleyConfig = null; /*{
    persist: {
      mode: 'all',
    },
  };*/

  // Define logic handlers according rc.json
  const logicHandlers = {
    persist: state => state,
    create: (state, action) => {
      const id = action.get('id');
      return state.set('', action.get('entity')).set('id', id);
    },
    change: (state, action) => {
      return state.set(action.get('path'), action.get('newValue'));
    },
    apply: (state, action) => {
      return state.merge('', action.get('patch'));
    },
    preview: (state, action) => {
      return state.merge('', action.get('patch'));
    },
    'update-aggregate': (state, action) => {
      const entity = action.get('entity');
      const fullPath = entity.meta.rootAggregatePath;
      const parentPath = fullPath.slice(-3);
      return state.set(parentPath, entity);
    },
    'clear-ref': (state, action) => {
      return state.set(action.get('path'), action.get('value'));
    },
    'clear-val': (state, action) => {
      const path = action.get('path');
      const value = action.get('value');
      return state.set(path, value).set(`private.${path}`, {});
    },
    'set-ref': (state, action) => {
      return state.set(action.get('path'), action.get('entityId'));
    },
    'add-ref': (state, action) => {
      const beforeId = action.get('beforeId');
      if (beforeId) {
        return state
          .push(action.get('path'), action.get('entityId'))
          .move(action.get('path'), action.get('entityId'), beforeId);
      } else {
        return state.push(action.get('path'), action.get('entityId'));
      }
    },
    'set-val': (state, action) => {
      const path = action.get('path');
      const entity = action.get('entity');
      return state
        .set(path, entity.id)
        .set(`private.${path}.${entity.id}`, entity);
    },
    'add-val': (state, action) => {
      const path = action.get('path');
      const entity = action.get('entity');
      const beforeId = action.get('beforeId');
      if (beforeId) {
        return state
          .push(path, entity.id)
          .move(path, entity.id, beforeId)
          .set(`private.${path}.${entity.id}`, entity);
      } else {
        return state
          .push(path, entity.id)
          .set(`private.${path}.${entity.id}`, entity);
      }
    },
    'move-ref': (state, action) => {
      return state.move(
        action.get('path'),
        action.get('entityId'),
        action.get('beforeEntityId')
      );
    },
    'move-val': (state, action) => {
      return state.move(
        action.get('path'),
        action.get('entityId'),
        action.get('beforeEntityId')
      );
    },
    'remove-val': (state, action) => {
      return state
        .unpush(action.get('path'), action.get('entityId'))
        .del(`private.${action.get('path')}.${action.get('entityId')}`);
    },
    'remove-ref': (state, action) => {
      return state.unpush(action.get('path'), action.get('entityId'));
    },
    backup: (state, action) => {
      const entity = action.get('entity');
      return state.set('private.backup', entity);
    },
    restore: state => {
      const backup = state.get('private.backup', null);
      return backup.set('private.backup', backup);
    },
    publish: state => {
      return state.set('meta.status', 'published');
    },
    archive: state => {
      return state.set('meta.status', 'archived');
    },
    'build-summaries': (state, action) => {
      const summaries = action.get('summaries');
      return state.set('meta.summaries', summaries);
    },
    compute: (state, action) => {
      const sums = action.get('sums');
      let stateSums = {};
      Object.keys(sums).forEach(sum => {
        if (!common.isFunction(sums[sum])) {
          stateSums[sum] = sums[sum].toString();
        }
      });
      return state.set('sums', stateSums);
    },
    version: (state, action) => {
      let version = state.get('meta.version');
      version++;
      return state
        .set('meta.createdAt', new Date().getTime())
        .set('meta.version', version);
    },
    'load-version': (state, action) => {
      const backup = state.get('private.backup', null);
      state = state.del('versions');
      if (backup) {
        state = state.merge('', action.get('version'));
        state = state.set('private.backup', backup.toJS());
        return state;
      } else {
        return state.set('', action.get('version'));
      }
    },
  };

  if (references) {
    const refQuests = {};
    for (const path in references) {
      const ref = references[path];

      if (common.referenceUseArity(ref)) {
        const type = common.getReferenceType(ref);

        refQuests[`add-${type}`] = function(quest, entityId, beforeId) {
          quest.me.addRef({path, entityId, beforeId});
        };

        refQuests[`add-copy-${type}`] = function*(
          quest,
          entityId,
          entity,
          deepCopy,
          beforeId
        ) {
          if (!entity) {
            entity = yield quest.me.getEntity({entityId});
          }
          const id = yield quest.me.addCopyVal({
            path,
            type,
            entityId: entity.id,
            entity,
            deepCopy: deepCopy !== undefined ? deepCopy : true,
            beforeId,
            asRoot: true,
          });
          return id;
        };

        refQuests[`remove-${type}`] = function(quest, entityId) {
          quest.me.removeRef({path, entityId});
        };

        refQuests[`move-${type}`] = function(
          quest,
          id,
          entityId,
          beforeEntityId
        ) {
          quest.me.moveRef({path, entityId, beforeEntityId});
        };

        refQuests[`clear-${path}`] = function*(quest) {
          quest.dispatch('clear-ref', {path, value: []});
          quest.evt('plugin', {eventType: 'cleared', type: type});
          yield quest.me.hydrate();
          quest.me.persist();
        };
      } else {
        //Entity case
        refQuests[`set-${path}`] = function(quest, entityId) {
          quest.me.setRef({path, entityId});
        };
      }
    }
    registerQuests(goblinName, refQuests);
  }

  if (values) {
    const valQuests = {};
    for (const path in values) {
      const val = values[path];

      if (common.referenceUseArity(val)) {
        const type = common.getReferenceType(val);

        valQuests[`add-new-${type}`] = function*(
          quest,
          payload,
          parentEntity,
          beforeId
        ) {
          if (!parentEntity) {
            parentEntity = quest.goblin.id;
          }
          const id = yield quest.me.addNewVal({
            path,
            type,
            payload,
            parentEntity,
            beforeId,
          });
          return id;
        };

        valQuests[`add-copy-${type}`] = function*(
          quest,
          entityId,
          entity,
          deepCopy,
          beforeId
        ) {
          if (!entity) {
            entity = yield quest.me.getEntity({entityId});
          }
          const id = yield quest.me.addCopyVal({
            path,
            type,
            entityId: entity.id,
            entity,
            deepCopy: deepCopy !== undefined ? deepCopy : true,
            beforeId,
            asRoot: false,
          });
          return id;
        };

        valQuests[`add-${type}`] = function*(
          quest,
          entityId,
          entity,
          beforeId
        ) {
          if (entity) {
            yield quest.me.addVal({path, entity, beforeId});
          } else {
            if (!entityId) {
              throw new Error(
                'Cannot add value ',
                type,
                ' in ',
                quest.goblin.id,
                ' missing or undefined entity or entityId'
              );
            }
            const entity = yield quest.me.getEntity({entityId});
            yield quest.me.addVal({path, entity, beforeId});
          }
        };

        valQuests[`remove-${type}`] = function*(quest, entityId, entity) {
          if (!entityId) {
            if (entity) {
              entityId = entity.id;
            } else {
              throw new Error(
                'Cannot remove value ',
                type,
                ' in ',
                quest.goblin.id,
                ' missing or undefined entity or entityId'
              );
            }
          }
          if (!entity) {
            entity = yield quest.me.getEntity({entityId});
          }
          yield quest.me.removeVal({path, entityId, entity});
        };

        valQuests[`move-${type}`] = function*(
          quest,
          id,
          entityId,
          beforeEntityId
        ) {
          yield quest.me.moveVal({path, entityId, beforeEntityId});
        };

        valQuests[`clear-${path}`] = function*(quest) {
          quest.dispatch('clear-val', {path, value: []});
          quest.evt('plugin', {eventType: 'cleared', type: type});
          yield quest.me.hydrate();
          quest.me.persist();
        };
      } else {
        //Entity case
        valQuests[`set-${path}`] = function*(quest, entityId, entity) {
          if (entity) {
            yield quest.me.setVal({path, entity});
          } else {
            if (!entityId) {
              return;
            }
            const entity = yield quest.me.getEntity({entityId});
            yield quest.me.setVal({path, entity});
          }
        };
      }
    }
    registerQuests(goblinName, valQuests);
  }

  if (actions) {
    Object.assign(logicHandlers, actions);
    registerActions(goblinName, actions);
  }

  if (quests) {
    registerQuests(goblinName, quests);
  }

  Goblin.registerQuest(goblinName, 'create', function*(
    quest,
    id,
    copyId,
    copyEntity,
    desktopId,
    loadedBy,
    entity,
    parentEntity,
    rootAggregateId,
    rootAggregatePath,
    mustExist,
    status,
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
    quest.goblin.setX('refSubs', {});
    quest.goblin.setX('desktopId', desktopId);
    quest.goblin.setX('loadedBy', loadedBy);
    quest.goblin.setX('rootAggregateId', rootAggregateId);
    quest.goblin.setX('rootAggregatePath', rootAggregatePath);
    quest.goblin.setX('refSubs', {});
    quest.goblin.setX('valSubs', {});
    let isNew = false;

    // draft -> published -> archived
    let initialStatus = status || newEntityStatus || 'draft';
    const r = quest.getStorage('rethink');

    //Copy case init:
    if (copyId) {
      if (copyEntity) {
        entity = copyEntity;
      } else {
        entity = yield r.get({table: type, documentId: copyId});
      }
      if (!entity) {
        throw new Error(`Cannot copy entity ${copyId}, not found`);
      }
      //change id
      entity.id = id;
      //reset meta-data
      delete entity.meta;
      //change meta-data
      entityMeta.set(
        entity,
        type,
        references,
        values,
        parentEntity,
        rootAggregateId,
        rootAggregatePath,
        initialStatus
      );

      //reset cached value
      entity.private = {};

      for (const path in values) {
        //reset ids
        entity[path] = [];
      }

      if (rootAggregateId === entity.id) {
        r.set({
          table: type,
          documents: entity,
        });
        quest.evt('persited');
      } else {
        const rootType = rootAggregateId.split('@')[0];
        r.setIn({
          table: rootType,
          documentId: rootAggregateId,
          path: rootAggregatePath,
          value: entity,
        });
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
      //ENSURE REFS/VALUES PATH EXIST
      for (const path in references) {
        const ref = references[path];
        if (common.referenceUseArity(ref)) {
          if (!entity[path]) {
            entity[path] = [];
          }
        } else {
          if (!entity[path]) {
            entity[path] = null;
          }
        }
      }

      for (const path in values) {
        const ref = values[path];
        if (common.referenceUseArity(ref)) {
          if (!entity[path]) {
            entity[path] = [];
          }
        } else {
          if (!entity[path]) {
            entity[path] = null;
          }
        }
      }

      //Init private data
      if (!entity.private) {
        entity.private = {};
      }

      if (values) {
        //set initial private values
        for (const val in values) {
          if (!entity.private[val]) {
            entity.private[val] = {};
          }
        }
      }

      if (computer) {
        if (!entity.sums) {
          entity.sums = {};
          entity.sums.base = 0;
        }
      }

      entityMeta.set(entity, type, references, values);

      // initial-import case
      if (entity.meta.status === 'initial-import') {
        entity.meta.status = 'published';
        quest.do({entity});
        yield quest.me.hydrate();
        quest.me.persist();
        return quest.goblin.id;
      }
    }

    if (!entity) {
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

      //set meta
      entityMeta.set(
        entity,
        type,
        references,
        values,
        parentEntity,
        rootAggregateId,
        rootAggregatePath,
        initialStatus
      );

      if (rootAggregateId === entity.id) {
        r.set({
          table: type,
          documents: entity,
        });
        quest.evt('persited');
      } else {
        const rootType = rootAggregateId.split('@')[0];
        delete entity.meta.persistedFromDesktopId;
        r.setIn({
          table: rootType,
          documentId: rootAggregateId,
          path: rootAggregatePath,
          value: entity,
        });
      }
    }

    //LISTEN ENTITY FLOW
    quest.goblin.defer(
      quest.sub(
        `*::*.${quest.goblin.id}.(publish|restore|archive)-requested`,
        (_, {data}) => quest.me[data]()
      )
    );

    if (entity.meta.status !== 'archived') {
      if (updateOnParentChange) {
        const hydrator = _.debounce(quest.me.hydrateFromParent, 50);
        quest.goblin.setX(
          'parentSub',
          quest.sub(`*::${loadedBy}.changed`, hydrator)
        );
      }
      //SUBSCRIBE TO REF CHANGES
      if (indexer || computer) {
        const refSubs = {};

        for (const path in references) {
          const ref = references[path];
          if (entity[path] === undefined) {
            throw new Error(
              `Your reference ${path} not match with your ${
                entity.meta.type
              } entity props`
            );
          }

          if (common.referenceUseArity(ref)) {
            for (const rId of entity[path]) {
              if (!refSubs[rId]) {
                refSubs[rId] = [];
              }
              //RE-HYDRATE
              const hydrator = _.debounce(quest.me.hydrate, 50);
              refSubs[rId].push(quest.sub(`*::${rId}.changed`, hydrator));
            }
          } else {
            //Entity case
            const rId = entity[path];
            if (rId && rId.length) {
              if (!refSubs[rId]) {
                refSubs[rId] = [];
              }

              //RE-HYDRATE
              const hydrator = _.debounce(quest.me.hydrate, 50);
              refSubs[rId].push(quest.sub(`*::${rId}.changed`, hydrator));
            }
          }
        }
        quest.goblin.setX('refSubs', refSubs);
      }

      //SUBSCRIBE TO VAL CHANGES
      if (indexer || computer) {
        const valSubs = {};

        for (const path in values) {
          const val = values[path];
          if (entity[path] === undefined) {
            throw new Error(
              `Your value ${path} not match with your ${
                entity.meta.type
              } entity props`
            );
          }

          if (common.referenceUseArity(val)) {
            for (const rId of entity[path]) {
              if (!valSubs[rId]) {
                valSubs[rId] = [];
              }
              //RE-HYDRATE
              const hydrator = _.debounce(quest.me.hydrate, 50);
              valSubs[rId].push(quest.sub(`*::${rId}.changed`, hydrator));
            }
          } else {
            //Entity case
            const rId = entity[path];
            if (rId && rId.length) {
              if (!valSubs[rId]) {
                valSubs[rId] = [];
              }

              //RE-HYDRATE
              const hydrator = _.debounce(quest.me.hydrate, 50);
              valSubs[rId].push(quest.sub(`*::${rId}.changed`, hydrator));
            }
          }
        }
        quest.goblin.setX('valSubs', valSubs);
      }
    }

    quest.do({entity});

    if (isNew) {
      yield quest.me.hydrate();
      if (afterNew) {
        yield quest.me.afterNew({entity});
      }
      quest.me.persist();
    }

    //backup 'at load' state
    const freshEntity = quest.goblin.getState().toJS();
    quest.dispatch('backup', {entity: freshEntity});

    return quest.goblin.id;
  });

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);
  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  Goblin.registerQuest(goblinName, 'hydrate-from-parent', function*(quest) {
    let entity = quest.goblin.getState().toJS();
    if (buildSummaries) {
      yield quest.me.buildSummaries({entity});
      entity = quest.goblin.getState().toJS();
    }
    if (indexer) {
      quest.me.index({entity});
    }
    quest.evt('hydrated-from-parent');
  });

  Goblin.registerQuest(goblinName, 'hydrate', function*(quest) {
    let entity = quest.goblin.getState().toJS();

    if (buildSummaries) {
      yield quest.me.buildSummaries({entity});
      entity = quest.goblin.getState().toJS();
    }
    if (computer) {
      yield quest.me.compute({entity});
      entity = quest.goblin.getState().toJS();
    }
    if (indexer) {
      quest.me.index({entity});
    }

    if (entity.meta.rootAggregateId !== quest.goblin.id) {
      const parentAPI = quest.getAPI(entity.meta.parentEntity);
      if (parentAPI) {
        yield parentAPI.updateAggregate({entity});
      }
    }

    quest.evt('changed');
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

    yield quest.me.hydrate();

    quest.me.persist();
  });

  Goblin.registerQuest(goblinName, 'update-aggregate', function*(
    quest,
    entity
  ) {
    quest.do();
    yield quest.me.hydrate();
    quest.me.persist();
  });

  Goblin.registerQuest(goblinName, 'delete-aggregate', function*(
    quest,
    entity
  ) {
    quest.do();
    const subs = quest.goblin.getX('valSubs');
    subs[entity.id]();
    yield quest.me.hydrate();
    quest.me.persist();
  });

  Goblin.registerQuest(goblinName, 'apply', function*(quest, patch) {
    quest.do();

    yield quest.me.hydrate();

    quest.me.persist();
  });

  Goblin.registerQuest(goblinName, 'preview', function(quest, patch) {
    quest.do();
  });

  Goblin.registerQuest(goblinName, 'get', function(quest) {
    let state = quest.goblin.getState().toJS();
    if (!state) {
      return null;
    }
    if (!state.meta) {
      return null;
    }
    return state;
  });

  Goblin.registerQuest(goblinName, 'add-ref', function*(
    quest,
    path,
    entityId,
    remote,
    beforeId
  ) {
    quest.do();
    const refSubs = quest.goblin.getX('refSubs');
    const desktopId = quest.goblin.getX('desktopId');

    //Add a ref for us too
    yield quest.create(entityId, {
      id: entityId,
      desktopId,
      loadedBy: quest.goblin.id,
    });

    if (!refSubs[entityId]) {
      refSubs[entityId] = [];
    }

    refSubs[entityId].push(
      quest.sub(`*::${entityId}.changed`, quest.me.hydrate)
    );

    quest.goblin.setX('refSubs', refSubs);
    quest.evt('plugin', {eventType: 'added', entityId, beforeId});

    if (!remote) {
      yield quest.me.hydrate();
      quest.me.persist();
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
    const desktopId = quest.goblin.getX('desktopId');

    const newEntityId = `${type}@${quest.uuidV4()}`;
    const newEntity = yield quest.create(
      newEntityId,
      Object.assign(
        {
          id: newEntityId,
          desktopId,
          parentEntity,
          rootAggregateId: quest.goblin.getX('rootAggregateId'),
          rootAggregatePath: quest.goblin
            .getX('rootAggregatePath')
            .concat(['private', path, newEntityId]),
          loadedBy: quest.goblin.id,
        },
        payload
      )
    );
    const entity = yield newEntity.get();
    yield quest.me.addVal({path, entity: entity, beforeId});
    return newEntityId;
  });

  Goblin.registerQuest(goblinName, 'add-copy-val', function*(
    quest,
    path,
    type,
    entityId,
    entity,
    deepCopy,
    beforeId,
    asRoot
  ) {
    //Prevent reference modifications via event-emitter
    const toCopy = Object.assign({}, entity);
    const desktopId = quest.goblin.getX('desktopId');
    const newEntityId = `${type}@${quest.uuidV4()}`;
    const payload = {
      id: newEntityId,
      copyId: entityId,
      copyEntity: entity,
      desktopId,
      loadedBy: quest.goblin.id,
      parentEntity: quest.goblin.id,
      rootAggregateId: quest.goblin.getX('rootAggregateId'),
      rootAggregatePath: quest.goblin
        .getX('rootAggregatePath')
        .concat(['private', path, newEntityId]),
    };

    //Force copy to be a root, useful when we copy val to ref
    if (asRoot) {
      payload.rootAggregateId = newEntityId;
      payload.rootAggregatePath = [];
    }

    const newEntityAPI = yield quest.create(newEntityId, payload);

    const newEntity = yield newEntityAPI.get();
    yield quest.me.addVal({path, entity: newEntity, beforeId, asRoot});

    if (deepCopy) {
      newEntityAPI.copyValues({entity: toCopy, deepCopy});
    }
    return newEntityId;
  });

  Goblin.registerQuest(goblinName, 'copy-values', function*(
    quest,
    entityId,
    entity,
    deepCopy
  ) {
    if (!entity) {
      entity = yield quest.me.getEntity({entityId});
    }
    for (const path in entity.meta.values) {
      const val = values[path];
      const type = common.getReferenceType(val);

      for (const entityId of entity[path]) {
        yield quest.me.addCopyVal({
          path,
          type,
          entityId,
          entity: entity.private[path][entityId],
          deepCopy,
        });
      }
    }
  });

  Goblin.registerQuest(goblinName, 'add-val', function*(
    quest,
    path,
    entity,
    remote,
    beforeId,
    asRoot
  ) {
    const desktopId = quest.goblin.getX('desktopId');
    const valSubs = quest.goblin.getX('valSubs');

    const aggregateInfo = {
      rootAggregateId: quest.goblin.getX('rootAggregateId'),
      rootAggregatePath: quest.goblin
        .getX('rootAggregatePath')
        .concat(['private', path, entity.id]),
    };

    if (!asRoot) {
      if (
        entity.meta.rootAggregatePath.join('/') !==
        aggregateInfo.rootAggregatePath.join('/')
      ) {
        entity.meta.rootAggregatePath = aggregateInfo.rootAggregatePath;
      }

      if (entity.meta.parentEntity !== quest.goblin.id) {
        entity.meta.parentEntity = quest.goblin.id;
      }
    }

    quest.do({entity});

    const addedEntityAPI = yield quest.create(entity.id, {
      id: entity.id,
      desktopId,
      entity,
      parentEntity: entity.meta.parentEntity,
      rootAggregateId: entity.meta.rootAggregateId,
      rootAggregatePath: entity.meta.rootAggregatePath,
      loadedBy: quest.goblin.id,
    });

    yield addedEntityAPI.apply({patch: entity});

    if (!valSubs[entity.id]) {
      valSubs[entity.id] = [];
    }

    valSubs[entity.id].push(
      quest.sub(`*::${entity.id}.changed`, quest.me.hydrate)
    );

    quest.goblin.setX('valSubs', valSubs);
    quest.evt('plugin', {eventType: 'added', entity, beforeId});

    if (!remote) {
      yield quest.me.hydrate();
      quest.me.persist();
    }

    return entity.id;
  });

  Goblin.registerQuest(goblinName, 'move-ref', function(
    quest,
    path,
    entityId,
    beforeEntityId
  ) {
    quest.do();
    quest.evt('plugin', {eventType: 'moved', entityId, beforeEntityId});
    quest.evt('changed');
    quest.me.persist();
  });

  Goblin.registerQuest(goblinName, 'move-val', function(
    quest,
    path,
    entityId,
    beforeEntityId
  ) {
    quest.do();
    quest.evt('plugin', {eventType: 'moved', entityId, beforeEntityId});
    quest.evt('changed');
    quest.me.persist();
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
    quest.evt('plugin', {eventType: 'removed', entityId});

    if (!remote) {
      yield quest.me.hydrate();
      quest.me.persist();
    }
  });

  Goblin.registerQuest(goblinName, 'remove-val', function*(
    quest,
    path,
    entityId,
    entity,
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
    quest.evt('plugin', {eventType: 'removed', entity});

    if (!remote) {
      yield quest.me.hydrate();

      const valueAPI = quest.getAPI(entityId);
      if (valueAPI) {
        yield valueAPI.deleteEntity();
      }
      quest.me.persist();
    }
  });

  Goblin.registerQuest(goblinName, 'set-ref', function*(
    quest,
    path,
    entityId,
    remote
  ) {
    const refSubs = quest.goblin.getX('refSubs');
    const desktopId = quest.goblin.getX('desktopId');

    const useKey = entityId;

    yield quest.create(useKey, {
      id: entityId,
      desktopId,
      loadedBy: quest.goblin.id,
    });

    if (!refSubs[entityId]) {
      refSubs[entityId] = [];
    }

    refSubs[entityId].push(
      quest.sub(`*::${entityId}.changed`, quest.me.hydrate)
    );

    quest.goblin.setX('refSubs', refSubs);
    quest.do();
    quest.evt('ref-setted');

    yield quest.me.hydrate();

    if (!remote) {
      quest.me.persist();
    }
  });

  Goblin.registerQuest(goblinName, 'set-val', function*(
    quest,
    path,
    entity,
    remote
  ) {
    const valSubs = quest.goblin.getX('valSubs');
    const desktopId = quest.goblin.getX('desktopId');

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

    valSubs[entity.id].push(
      quest.sub(`*::${entity.id}.changed`, quest.me.hydrate)
    );

    quest.goblin.setX('valSubs', valSubs);
    quest.do();
    quest.evt('val-setted');

    yield quest.me.hydrate();

    if (!remote) {
      quest.me.persist();
    }
  });

  Goblin.registerQuest(goblinName, 'persist', function(quest) {
    const entity = quest.goblin.getState().toJS();

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

    const rootAggregateId = quest.goblin.getX('rootAggregateId');
    const r = quest.getStorage('rethink');

    r.set({
      table: type,
      documents: entity,
    });

    if (rootAggregateId !== entity.id) {
      const rootType = rootAggregateId.split('@')[0];
      const rootAggregatePath = quest.goblin.getX('rootAggregatePath');
      delete entity.meta.persistedFromDesktopId;
      r.setIn({
        table: rootType,
        documentId: rootAggregateId,
        path: rootAggregatePath,
        value: entity,
      });
    }

    quest.do({state: entity});

    quest.evt('persisted');
    quest.log.info(`${entity.id} persisted`);
  });

  if (buildSummaries) {
    Goblin.registerQuest(goblinName, 'build-summaries', function*(
      quest,
      entity,
      next
    ) {
      let peers = {};
      if (references || values || updateOnParentChange) {
        peers = yield* buildPeers(quest, entity);
      }
      let summaries = entity.meta.summaries;
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
        entity = quest.goblin.getState().toJS();
      }
      const desktopId = quest.goblin.getX('desktopId');
      if (common.isGenerator(afterNew)) {
        yield* afterNew(quest, desktopId, entity, next);
      } else {
        afterNew(quest, desktopId, entity);
      }
    });
  }

  if (indexer) {
    Goblin.registerQuest(goblinName, 'index', function*(quest, entity, next) {
      if (!entity) {
        entity = quest.goblin.getState().toJS();
      }

      let peers = {};
      if (references || values || updateOnParentChange) {
        peers = yield* buildPeers(quest, entity);
      }

      const e = quest.getStorage('elastic');
      let doc = {};
      if (common.isGenerator(indexer)) {
        doc = yield* indexer(quest, entity, peers, new MarkdownBuilder(), next);
      } else {
        doc = indexer(quest, entity, peers, new MarkdownBuilder());
      }

      if (doc.info) {
        doc.searchAutocomplete = doc.info;
        doc.searchPhonetic = doc.info;
      }

      const index = {
        documentId: entity.id,
        type: type,
        document: doc,
      };
      e.index(index);
      quest.evt('indexed');
    });
  }

  if (references) {
    Object.keys(references).forEach(path => {
      Goblin.registerQuest(goblinName, `fetch-${path}`, function*(quest) {
        const peers = {};
        const entity = quest.goblin.getState().toJS();
        yield* fetchPeers(quest, peers, entity, references, path);
        return peers[Object.keys(peers)[0]];
      });
    });
  }

  if (values) {
    Object.keys(values).forEach(path => {
      Goblin.registerQuest(goblinName, `fetch-${path}`, function(quest) {
        const peers = {};
        const entity = quest.goblin.getState().toJS();
        fetchValues(quest, peers, entity, values, path);
        return peers[Object.keys(peers)[0]];
      });
    });
  }

  if (computer) {
    Goblin.registerQuest(goblinName, 'compute', function*(quest, entity, next) {
      if (!entity) {
        entity = quest.goblin.getState().toJS();
      }

      let sums = {
        base: new BigNumber(0),
        cost: new BigNumber(0),
        reward: new BigNumber(0),
      };

      let peers = {};
      if (references || values) {
        peers = yield* buildPeers(quest, entity);
      }

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
                if (c.sums) {
                  if (!c.sums[sum]) {
                    c.sums[sum] = new BigNumber(0);
                  }
                  return p.plus(c.sums[sum]);
                } else {
                  return p;
                }
              }, new BigNumber(0))
            );
          });
        });

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

    if (updateOnParentChange) {
      quest.goblin.getX('parentSub')();
    }

    quest.evt('disposed');
  };

  /////////////////////////////////////////////////////////////////
  // <Entity flow builder>
  const buildEntityFlowPropagator = (verb, evt) => {
    Goblin.registerQuest(goblinName, `${verb}-entity`, function*(quest, next) {
      const document = quest.goblin.getState().toJS();
      quest.defer(quest.sub(`*::${document.id}.${evt}`, next.parallel()));
      quest.evt(`${document.id}.${verb}-requested`, verb);
      //cascade sub-documents
      const traverseValues = subDoc => {
        for (const path in subDoc.meta.values) {
          if (subDoc[path]) {
            for (const entityId of subDoc[path]) {
              const entity = subDoc.private[path][entityId];
              if (entity) {
                traverseValues(entity);
                quest.defer(
                  quest.sub(`*::${entity.id}.${evt}`, next.parallel())
                );
                quest.evt(`${entity.id}.${verb}-requested`, verb);
              }
            }
          }
        }
      };
      traverseValues(document);
      yield next.sync();
      quest.evt(`entity-${evt}`);
    });
  };

  //Publish
  buildEntityFlowPropagator('publish', 'published');
  Goblin.registerQuest(goblinName, 'publish', function(quest) {
    const document = quest.goblin.getState();
    const meta = document.get('meta').toJS();
    const isRoot = meta.rootAggregateId === meta.id;

    //skip quest if already published
    if (document.get('meta.status') === 'published') {
      quest.evt('published');
      return;
    }

    //if root draft is untouched
    if (isRoot && document.get('meta.status') === 'draft') {
      const backup = document.get('private.backup', null);
      const entity = document.del('private.backup');
      if (backup && entity.equals(backup)) {
        quest.evt('published');
        return;
      }
    }

    //set published
    quest.do();

    quest.me.persist();
    quest.evt('published');
  });

  buildEntityFlowPropagator('restore', 'restored');
  Goblin.registerQuest(goblinName, 'restore', function(quest) {
    const document = quest.goblin.getState();
    const backup = document.get('private.backup', null);
    const entity = document.del('private.backup');
    if (backup && entity.equals(backup)) {
      quest.evt('restored');
      return;
    }
    //rollback
    quest.do();
    quest.me.persist();
    quest.evt('restored');
  });

  // Archive
  buildEntityFlowPropagator('archive', 'archived');
  Goblin.registerQuest(goblinName, 'archive', function(quest) {
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

    quest.me.persist();
    quest.evt('archived');
  });

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
  return Goblin.configure(goblinName, logicState, logicHandlers, ripleyConfig);
}

builder.entities = types;

module.exports = builder;
