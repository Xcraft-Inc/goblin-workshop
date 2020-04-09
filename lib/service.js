'use strict';

const path = require('path');
const Goblin = require('xcraft-core-goblin');
const fs = require('fs');
const xConfig = require('xcraft-core-etc')().load('xcraft');
const $ = require('highland');
const goblinName = path.basename(module.parent.filename, '.js');
const Shredder = require('xcraft-core-shredder');
const CryoProcessor = require('./cryo-processor.js');
const workshopConfig = require('xcraft-core-etc')().load('goblin-workshop');
const entityTypes = require('./entity-builder.js').entities;
const entityConfiguration = require('./entity-builder.js').configurations;
const indexBuilder = require('./indexer/indexBuilder.js');
const entityStorage = workshopConfig.entityStorageProvider.replace(
  'goblin-',
  ''
);

const entityStorageServicePoolSize =
  workshopConfig.entityStorageServicePoolSize || 4;

const logicState = {
  id: goblinName,
  schema: {},
  maintenance: {
    status: 'off', // off, soft, hard
    progress: null,
    message: null,
  },
  cryo: {
    available: false,
  },
  poolInfo: {},
};
//const schemaPropsList = ['references', 'values', 'properties'];
const logicHandlers = {
  'init': (state, action) => {
    /*const schema = Object.entries(action.get('configurations')).reduce(
      (schema, entry) => {
        const [type, config] = entry;
        schema[type] = Object.entries(config)
          .filter(([prop, _]) => schemaPropsList.includes(prop))
          .reduce((props, [prop, value]) => {
            props[prop] = value;
            return props;
          }, {});
        return schema;
      },
      {}
    );*/
    return state.set('cryo.available', action.get('available'));
    //.set('schema', schema);
  },
  'init-storage': (state, action) => {
    const mainStorage = action.get('mainStorage');
    return state.set(`poolInfo.${mainStorage}`, action.get('poolInfo'));
  },
  'join-storage-pool': (state, action) => {
    const mainStorage = action.get('mainStorage');
    const poolId = action.get('poolId');
    const useWeight = action.get('useWeight');

    const pool = state.get(`poolInfo.${mainStorage}.pool-${poolId}`);
    const newPoolState = pool
      .set('consumers', pool.get('consumers') + 1)
      .set('useWeight', pool.get('useWeight') + useWeight);

    return state.set(`poolInfo.${mainStorage}.pool-${poolId}`, newPoolState);
  },
  'leave-storage-pool': (state, action) => {
    const mainStorage = action.get('mainStorage');
    const poolId = action.get('poolId');
    const useWeight = action.get('useWeight');

    const pool = state.get(`poolInfo.${mainStorage}.pool-${poolId}`);
    const newPoolState = pool
      .set('consumers', pool.get('consumers') - 1)
      .set('useWeight', pool.get('useWeight') - useWeight);

    return state.set(`poolInfo.${mainStorage}.pool-${poolId}`, newPoolState);
  },
  'maintenance': (state, action) => {
    const status = action.get('status');
    const progress = action.get('progress');

    if (status) {
      state = state
        .set('maintenance.status', status)
        .set(
          'maintenance.message',
          status !== 'off' ? action.get('message') : null
        );

      if (status === 'off' && !progress) {
        state = state.set('maintenance.progress', null);
      }
    }

    if (progress !== undefined && progress !== null) {
      state = state.set(
        'maintenance.progress',
        progress > 1.0 ? 1.0 : progress
      );
    }

    return state;
  },
};

const watt = require('gigawatts');

const sendCommand = watt(function*(cmd, data, resp, next) {
  const {BusClient} = require('xcraft-core-busclient');

  const busClient = new BusClient(null, ['*::*']);
  busClient.on('commands.registry', next.parallel());
  busClient.connect('ee', null, next.parallel());
  yield next.sync();

  const orcName = busClient.getOrcName();
  const _resp = busClient.newResponse(`workshop`, orcName);
  const unsub0 = _resp.events.subscribe(`workshop.ripleying`, msg => {
    resp.log.progress('ripleying', msg.data.progress, 1.0);
  });
  const unsub1 = _resp.events.subscribe(`workshop.step`, msg => {
    resp.log.info(`ripley: ${msg.data}`);
  });

  yield _resp.command.send(cmd, data, next);

  unsub0();
  unsub1();

  const unsub = busClient.events.subscribe(
    `${orcName}::disconnect.finished`,
    next.parallel().arg(0)
  );
  _resp.command.send('disconnect');
  yield next.sync();
  unsub();

  yield busClient.stop(next);
});
const configurations = require('./entity-builder.js').configurations;
Goblin.registerQuest(goblinName, 'init', function*(quest) {
  quest.goblin.setX('desktopId', 'system');
  // const isUsable = yield quest.cmd(`cryo.usable`);
  /* FIXME: consider that cryo is always usable. We can't send a command here
   * because the horde (cryo) is not initialized.
   */
  quest.do({available: true});

  for (const config of Object.values(configurations)) {
    const serviceId = `entity-schema@${config.type}`;
    yield quest.create(serviceId, {
      id: serviceId,
      desktopId: 'system',
      entityType: config.type,
    });
  }

  yield quest.cmd(`activity-monitor.init`);
  yield quest.cmd(`entity-flow-updater.init`);
  yield quest.cmd(`entity-cache-feeder.init`);
  yield quest.cmd(`aggregate-updater.init`);
  yield quest.cmd(`entity-driller.init`);
  yield quest.cmd(`entity-counter.init`);
  yield quest.cmd(`entity-deleter.init`);
  yield quest.cmd(`dragon.init`, {host: 'localhost'});
  //yield quest.me.feedDragon();
  yield quest.me.findOrphanDocumentPositions();
});

Goblin.registerQuest(goblinName, 'findOrphanDocumentPositions', function*(
  quest,
  next
) {
  const dragon = quest.getAPI('dragon');

  const cursor = yield dragon.findNotReferencedFrom({
    fromType: 'document',
    toType: 'documentPosition',
  });
  let run = true;
  let idToClean = [];
  do {
    try {
      const id = yield cursor.next(next);
      idToClean.push(id);
      if (idToClean.length > 100) {
        console.log('cleaning batch...');
        yield dragon.clean({
          database: 'vcy',
          type: 'documentPosition',
          ids: idToClean,
        });
        idToClean = [];
      }
    } catch {
      run = false;
    }
  } while (run);
  if (idToClean.length > 0) {
    console.log('cleaning last batch...');
    yield dragon.clean({
      database: 'vcy',
      type: 'documentPosition',
      ids: idToClean,
    });
  }
});

Goblin.registerQuest(goblinName, 'feed-dragon', function*(quest) {
  const common = require('./workitems/common.js');
  const dragon = quest.getAPI('dragon');

  const nonRoot = {};
  //first pass: detect by value entity (non-root)
  for (const config of Object.values(entityConfiguration)) {
    if (config.values) {
      for (const ref of Object.values(config.values)) {
        const toType = common.getReferenceType(ref);
        nonRoot[toType] = true;
      }
    }
  }
  //second pass: exlude by ref entities (root)
  for (const config of Object.values(entityConfiguration)) {
    if (config.references) {
      for (const ref of Object.values(config.references)) {
        const toType = common.getReferenceType(ref);
        delete nonRoot[toType];
      }
    }
  }
  const rootEntities = Object.keys(entityConfiguration).filter(
    e => nonRoot[e] === undefined
  );
  for (const type of rootEntities) {
    yield dragon.feedRoot({database: 'vcy', type});
  }

  for (const [fromType, config] of Object.entries(entityConfiguration)) {
    if (config.references) {
      for (const [prop, ref] of Object.entries(config.references)) {
        const toType = common.getReferenceType(ref);
        if (common.referenceUseArity(ref)) {
          yield dragon.feedMany({
            database: 'vcy',
            fromType: fromType,
            toType: toType,
            property: prop,
            label: `${fromType}.${prop}`,
          });
        } else {
          yield dragon.feedOne({
            database: 'vcy',
            fromType: fromType,
            toType: toType,
            property: prop,
            label: `${fromType}.${prop}`,
          });
        }
      }
    }
  }
});

Goblin.registerQuest(goblinName, 'create-hinter-for', function*(
  quest,
  desktopId,
  workitemId,
  detailWidget,
  detailKind,
  detailWidth,
  newButtonTitle,
  newWorkitem,
  usePayload,
  withDetails,
  name,
  type,
  title,
  glyph,
  kind
) {
  const serviceName = name ? name : type;
  const widgetId = workitemId ? `${serviceName}-hinter@${workitemId}` : null;
  if (!desktopId) {
    throw new Error('No desktopId provided');
  }
  if (!type) {
    throw new Error('Hinter type required');
  }

  if (!kind) {
    kind = 'list';
  }

  if (!title) {
    title = type;
  }

  let goblinName = Goblin.getGoblinName(workitemId);

  const hinter = yield quest.createFor(
    goblinName,
    workitemId,
    `hinter@${widgetId}`,
    {
      id: widgetId,
      name,
      type,
      desktopId,
      title,
      glyph,
      kind,
      detailWidget,
      detailKind,
      detailWidth,
      newButtonTitle,
      newWorkitem,
      usePayload,
      withDetails,
    }
  );

  return hinter.id;
});

Goblin.registerQuest(
  goblinName,
  'generate-entities-graph',
  require('./entity-graph.js')
);

Goblin.registerQuest(goblinName, 'get-available-entities', function(quest) {
  // TODO: check entity service availability
  // const {projectPath} = require('xcraft-core-host');
  // add suffix '-entity.js' for entity service in a app ?
  return entityTypes;
});

//useWeight: estimated usage of storage by consumer
//0-non signifiant (will be ignored)
//1-n more significative (will influance the pool choice)
Goblin.registerQuest(goblinName, 'join-storage-pool', function(
  quest,
  desktopId,
  useWeight
) {
  const mainStorage = quest.getStorage(entityStorage).id;
  const poolInfo = quest.goblin.getState().get(`poolInfo.${mainStorage}`);

  const bestByConsumers = poolInfo._state.minBy(p => p.get('consumers'));
  const bestByWeights = poolInfo._state.minBy(p => p.get('useWeight'));

  if (bestByConsumers.get('id') === bestByWeights.get('id')) {
    quest.do({mainStorage, poolId: bestByConsumers.get('id'), useWeight});
    return `${mainStorage}@${bestByConsumers.get('id')}`;
  } else {
    quest.do({mainStorage, poolId: bestByWeights.get('id'), useWeight});
    return `${mainStorage}@${bestByWeights.get('id')}`;
  }
});

Goblin.registerQuest(goblinName, 'leave-storage-pool', function(
  quest,
  desktopId,
  poolId,
  useWeight
) {
  const mainStorage = quest.getStorage(entityStorage).id;
  quest.do({mainStorage, poolId, useWeight});
});

Goblin.registerQuest(goblinName, 'init-storage', function*(
  quest,
  desktopId,
  configuration,
  customIndexesByType,
  orderIndexesByType,
  next
) {
  //create main mandate storage (rethink) service
  const mainStorage = `${entityStorage}@${configuration.mandate}`;
  yield quest.create(mainStorage, {
    id: mainStorage,
    desktopId: `system@${configuration.mandate}`,
    host: configuration.rethinkdbHost,
    database: configuration.mandate,
  });

  //create service pool
  let poolInfo = {};
  for (let i = 1; i <= entityStorageServicePoolSize; i++) {
    poolInfo[`pool-${i}`] = {id: i, useWeight: 0, consumers: 0};
    const poolStorageId = `${entityStorage}@${configuration.mandate}@${i}`;
    yield quest.create(poolStorageId, {
      id: poolStorageId,
      desktopId: `system@${configuration.mandate}`,
      host: configuration.rethinkdbHost,
      database: configuration.mandate,
    });
  }
  quest.do({mainStorage, poolInfo});

  const r = quest.getStorage(entityStorage);
  if (configuration.action === 'reset') {
    yield r.resetDatabase();
  } else {
    yield r.ensureDatabase();
  }

  yield r.ensureTable({table: 'deleted'});
  yield r.ensureIndex({table: 'deleted'});

  if (entityTypes) {
    for (const config of Object.values(configurations)) {
      const serviceId = `entity-schema@${config.type}`;
      yield quest.create(serviceId, {
        id: serviceId,
        desktopId,
        entityType: config.type,
      });
    }
    for (const entity of entityTypes) {
      r.ensureTable({table: entity}, next.parallel());
    }
    yield next.sync();
    for (const entity of entityTypes) {
      r.ensureIndex({table: entity}, next.parallel());
    }
    yield next.sync();
  }

  if (customIndexesByType) {
    for (const customIndex of customIndexesByType) {
      r.ensureCustomIndexes(
        {
          table: customIndex.type,
          indexesFunc: customIndex.customIndexes,
        },
        next.parallel()
      );
    }
    yield next.sync();
  }
  if (orderIndexesByType) {
    for (const orderIndex of orderIndexesByType) {
      r.ensureOrderIndexes(
        {
          table: orderIndex.type,
          orderedBy: orderIndex.orderedBy,
        },
        next.parallel()
      );
    }
    yield next.sync();
  }
});

Goblin.registerQuest(goblinName, 'init-indexer', function*(
  quest,
  indexes,
  configuration,
  indexerMappingsByType,
  next
) {
  const reset = configuration.action === 'reset';
  let e = null;
  if (!indexes) {
    const index = configuration.mandate;
    const elasticId = `elastic@${index}`;
    e = yield quest.create(elasticId, {
      id: elasticId,
      desktopId: `system@${index}`,
      url: configuration.elasticsearchUrl,
      index,
    });
    if (reset) {
      yield e.resetIndex();
    } else {
      yield e.ensureIndex();
    }

    for (const type of entityTypes) {
      e.ensureType(
        {
          type,
        },
        next.parallel()
      );
    }
    yield next.sync();
  } else {
    for (const index of indexes) {
      const elasticId = `elastic@${index}`;
      e = yield quest.create(elasticId, {
        id: elasticId,
        desktopId: `system@${index}`,
        url: configuration.elasticsearchUrl,
        index,
      });
      if (reset) {
        yield e.resetIndex();
      } else {
        yield e.ensureIndex();
      }

      for (const type of entityTypes) {
        e.ensureType(
          {
            type,
          },
          next.parallel()
        );
      }
      yield next.sync();
    }
  }
  if (indexerMappingsByType && indexerMappingsByType.length > 0) {
    for (const mapping of indexerMappingsByType) {
      e.putMapping(mapping, next.parallel());
    }
    yield next.sync();
  }
});

Goblin.registerQuest(goblinName, 'get-mandate-storage-root-path', function*(
  quest,
  desktopId
) {
  const deskAPI = quest.getAPI(desktopId).noThrow();
  const r = quest.getStorage(entityStorage);
  const mandate = yield r.get({
    table: 'mandate',
    documentId: 'mandate@main',
  });

  if (!mandate || !mandate.storage || mandate.storage.rootPath === undefined) {
    yield deskAPI.addNotification({
      color: 'red',
      message: `Impossible de trouver une configuration de stockage valide
          veuillez configurer le stockage dans admin/options`,
      glyph: 'solid/exclamation-triangle',
    });
    return null;
  }

  let storagePath = mandate.storage.rootPath;
  if (!path.isAbsolute(storagePath)) {
    const relPath = storagePath || '';
    storagePath = path.join(xConfig.xcraftRoot, 'var', relPath);
  }

  if (!fs.existsSync(storagePath)) {
    yield deskAPI.addNotification({
      color: 'red',
      message: `Le stockage est mal configuré, le chemin ${storagePath}
      n'existe pas!
      Veuillez modifier la configuration du stockage dans admin/options`,
      glyph: 'solid/exclamation-triangle',
    });
    return null;
  }
  return storagePath;
});

Goblin.registerQuest(
  goblinName,
  'get-mandate-storage-server-host-name',
  function*(quest, desktopId) {
    const deskAPI = quest.getAPI(desktopId).noThrow();
    const r = quest.getStorage(entityStorage);
    const mandate = yield r.get({
      table: 'mandate',
      documentId: 'mandate@main',
    });

    if (
      !mandate ||
      !mandate.storage ||
      mandate.storage.serverHostName === undefined
    ) {
      yield deskAPI.addNotification({
        color: 'red',
        message: `Impossible de trouver un serveur de stockage de fichiers valide
          veuillez le configurer dans admin/options`,
        glyph: 'solid/exclamation-triangle',
      });
      return null;
    }

    if (mandate.storage.serverHostName) {
      return `https://${mandate.storage.serverHostName}`;
    } else {
      // local path
      return yield quest.me.getMandateStorageRootPath({
        desktopId,
      });
    }
  }
);

Goblin.registerQuest(
  goblinName,
  'get-mandate-default-password-length',
  function*(quest, desktopId) {
    const deskAPI = quest.getAPI(desktopId).noThrow();
    const r = quest.getStorage(entityStorage);
    const mandate = yield r.get({
      table: 'mandate',
      documentId: 'mandate@main',
    });

    if (!mandate) {
      yield deskAPI.addNotification({
        color: 'red',
        message: `Impossible de trouver une configuration valide
          veuillez modifier la configuration dans admin/options`,
        glyph: 'solid/exclamation-triangle',
      });
      return null;
    }

    return mandate.defaultPasswordLength || undefined;
  }
);

//WIP: BATCHING OPERATIONS
Goblin.registerQuest(goblinName, 'trash-entities', function*(
  quest,
  desktopId,
  dataPath,
  type,
  next
) {
  const stream = require('fs').createReadStream(dataPath);
  const rl = require('readline').createInterface({
    input: stream,
  });

  const entityIds = [];
  rl.on('line', id => {
    entityIds.push(id);
  });
  yield rl.once('close', next.arg(0));

  const r = quest.getStorage(entityStorage);
  const entities = yield r.getAll({table: type, documents: entityIds});
  yield $(entities)
    .filter(entity => entity.meta.status !== 'trashed')
    .map(entity => n =>
      quest.create(
        type,
        {id: entity.id, entity: new Shredder(entity), mustExist: true},
        n
      )
    )
    .nfcall([])
    .parallel(Number.MAX_VALUE)
    .flatten()
    .compact()
    .map(api => n => api.trash({}, () => n(null, api.id)))
    .nfcall([])
    .parallel(Number.MAX_VALUE)
    .flatten()
    .compact()
    .batch(100)
    .map(toKill => n => quest.kill(toKill, n))
    .nfcall([])
    .parallel(Number.MAX_VALUE)
    .done(next);

  quest.log.dbg('done');
});

Goblin.registerQuest(goblinName, 'hydrate-entities', function*(
  quest,
  desktopId,
  dataPath,
  type,
  next
) {
  const stream = require('fs').createReadStream(dataPath);
  const rl = require('readline').createInterface({
    input: stream,
  });

  const entityIds = [];
  rl.on('line', id => {
    entityIds.push(id);
  });
  yield rl.once('close', next.arg(0));

  const r = quest.getStorage(entityStorage);
  const entities = yield r.getAll({table: type, documents: entityIds});
  yield $(entities)
    .compact()
    .each(entity => {
      quest.evt('hydrate-entity-requested', {
        desktopId: quest.getDesktop(),
        entityId: entity.id,
        rootAggregateId: entity.meta.rootAggregateId,
        rootAggregatePath: entity.meta.rootAggregatePath,
        muteChanged: true,
        muteHydrated: false,
        notify: false,
        options: {
          rebuildValueCache: false,
          buildSummaries: false,
          compute: false,
          index: false,
        },
      });
    })
    .done(next);

  quest.log.dbg('done');
});

Goblin.registerQuest(goblinName, 'reindex-entities-from-storage', function*(
  quest,
  desktopId,
  type,
  status,
  batchSize
) {
  if (!entityConfiguration[type]) {
    return;
  }
  if (!entityConfiguration[type].indexer) {
    return;
  }
  if (!batchSize) {
    batchSize = 1000;
  }
  const r = quest.getStorage(entityStorage);
  const e = quest.getStorage('elastic');
  const range = {start: 0, length: batchSize};
  const total = yield r.count({
    table: type,
    contentIndex: {name: 'status', value: status},
  });
  let done = false;
  while (!done) {
    const entities = yield r.getAll({
      table: type,
      status,
      range,
    });
    let indexes = [];
    for (const entity of entities) {
      const body = yield indexBuilder(
        quest,
        quest.getSession(),
        type,
        entity.id,
        entity,
        entityConfiguration[type]
      );
      if (body) {
        indexes = indexes.concat(body);
      }
    }
    if (indexes.length > 0) {
      yield e.bulk({body: indexes});
    }

    if (range.start + range.length > total) {
      done = true;
    }
    range.start += batchSize;
  }
});

Goblin.registerQuest(goblinName, 'maintenance', function*(
  quest,
  status,
  progress,
  message,
  $msg
) {
  const _status = quest.goblin.getState().get('maintenance.status');
  if (status === _status) {
    quest.do();
    return;
  }

  if (status !== 'off') {
    // begins maintenance
    yield quest.warehouse.maintenance({
      enable: true,
      description: message,
      orcName: $msg.orcName,
    });
  } else {
    // stop maintenance
    yield quest.warehouse.maintenance({
      enable: false,
      description: null,
      orcName: $msg.orcName,
    });
  }

  quest.do();
  quest.evt('maintenance', status);
});

Goblin.registerQuest(goblinName, 'ripley', function*(
  quest,
  dbSrc,
  dbDst,
  timestamp
) {
  const configurator = null;
  return yield sendCommand(
    'workshop.prepare-ripley',
    {configurator, dbSrc, dbDst, timestamp},
    quest.resp
  );
});

Goblin.registerQuest(goblinName, 'ripley-for', function*(
  quest,
  dbSrc,
  dbDst,
  timestamp,
  rethinkdbHost,
  elasticsearchUrl,
  appId
) {
  const configurator = {
    rethinkdbHost,
    elasticsearchUrl,
  };
  return yield sendCommand(
    'workshop.prepare-ripley',
    {configurator, dbSrc, dbDst, timestamp, appId},
    quest.resp
  );
});

Goblin.registerQuest(goblinName, 'prepare-ripley', function*(
  quest,
  configurator,
  dbSrc,
  dbDst,
  timestamp,
  appId
) {
  try {
    yield quest.me.maintenance({status: 'hard', message: 'Ripleying'});
    yield quest.me.startRipley({configurator, dbSrc, dbDst, timestamp, appId});
  } finally {
    yield quest.me.maintenance({status: 'off'});
  }
});

Goblin.registerQuest(goblinName, 'start-ripley', function*(
  quest,
  configurator,
  dbSrc,
  dbDst,
  timestamp,
  appId
) {
  const cryoProcessor = new CryoProcessor(
    goblinName,
    quest,
    configurator,
    dbSrc,
    dbDst,
    timestamp,
    appId
  );

  yield cryoProcessor.init();

  yield cryoProcessor.branchIfNeeded();

  /* Boot the databases (with reset flag to true) */
  yield quest.me.maintenance({
    status: 'hard',
    message: 'running cryo',
  });

  yield cryoProcessor.run();

  yield cryoProcessor.restore();

  quest.evt('ripleying', {progress: 1.0});
  yield quest.me.maintenance({progress: 1.0});
});

Goblin.registerQuest(goblinName, 'generate-workitems-templates', function(
  quest,
  goblinLib,
  entityType
) {
  const {projectPath} = require('xcraft-core-host');
  const {mkdir} = require('xcraft-core-fs');
  const configurations = require('./entity-builder.js').configurations;
  const common = require('./workitems/common.js');
  const goblinRoot = path.join(projectPath, 'lib', goblinLib);
  if (!fs.existsSync(goblinRoot)) {
    throw new Error(
      `Cannot generate-workitems in ${goblinRoot}: the folder not exists`
    );
  }

  const widgetsRoot = path.join(goblinRoot, 'widgets');
  if (!fs.existsSync(widgetsRoot)) {
    throw new Error(
      `Cannot generate-workitems in ${widgetsRoot}: the folder not exists`
    );
  }

  const getEntityConfig = type => {
    const config = configurations[type];
    if (!config) {
      throw new Error(`Bad entity type: ${type}, the entity not exists`);
    }
    return config;
  };

  const rootEntityConfig = getEntityConfig(entityType);
  const pluginFiles = [];
  const hinterFiles = [];
  const workitemFiles = [];
  const searchFiles = [];

  const tryPushServiceHandlerFile = (type, fileKind, collection) => {
    const filePath = path.join(goblinRoot, `${type}-${fileKind}.js`);
    if (!fs.existsSync(filePath)) {
      collection.push({type, filePath});
    }
  };

  const tryPushWorkitem = type => {
    const destPath = path.join(widgetsRoot, `${type}-workitem`);
    mkdir(destPath);
    const servicePath = path.join(destPath, 'service.js');
    if (!fs.existsSync(servicePath)) {
      workitemFiles.push({type, filePath: servicePath});
    }
    const uiPath = path.join(destPath, 'ui.js');
    if (!fs.existsSync(uiPath)) {
      workitemFiles.push({type, filePath: uiPath});
    }
  };

  const tryPushPlugin = type => {
    const destPath = path.join(widgetsRoot, `plugin-${type}`);
    mkdir(destPath);
    const widgetPath = path.join(destPath, 'widget.js');
    if (!fs.existsSync(widgetPath)) {
      pluginFiles.push({type, filePath: widgetPath});
    }
  };

  const browseCollections = collection => {
    for (const ref of Object.values(collection)) {
      const type = common.getReferenceType(ref);

      tryPushServiceHandlerFile(type, 'workitem', workitemFiles);
      tryPushWorkitem(type);

      if (common.referenceUseArity(ref)) {
        tryPushServiceHandlerFile(type, 'plugin', pluginFiles);
        tryPushPlugin(type);
      } else {
        const refConfig = getEntityConfig(type);
        if (refConfig.indexer) {
          tryPushServiceHandlerFile(type, 'hinter', hinterFiles);
        }
      }
    }
  };

  const rootEntityType = rootEntityConfig.type;

  tryPushServiceHandlerFile(rootEntityType, 'workitem', workitemFiles);
  tryPushWorkitem(rootEntityType);

  if (rootEntityConfig.indexer) {
    tryPushServiceHandlerFile(rootEntityType, 'hinter', hinterFiles);
    tryPushServiceHandlerFile(rootEntityType, 'search', searchFiles);
  }

  if (rootEntityConfig.references) {
    browseCollections(rootEntityConfig.references);
  }

  if (rootEntityConfig.values) {
    browseCollections(rootEntityConfig.values);
  }

  console.dir(workitemFiles);
  const workitemServiceHandler = require('../templates/serviceHandlers/workitem.js');
  const workitemService = require('../templates/workitem/service.js');
  const workitemUi = require('../templates/workitem/ui.js');
  for (const {type, filePath} of workitemFiles) {
    const config = getEntityConfig(type);
    if (filePath.endsWith('-workitem.js')) {
      const content = workitemServiceHandler(
        path.basename(filePath).replace('.js', '')
      );
      fs.writeFileSync(filePath, content);
    }
    if (filePath.endsWith('service.js')) {
      const content = workitemService(type);
      fs.writeFileSync(filePath, content);
    }
    if (filePath.endsWith('ui.js')) {
      let fields = [];
      let collections = [];
      if (config.properties) {
        fields = Object.entries(config.properties).map(([name, infos]) => {
          return {name, ...infos};
        });
      }
      if (config.values) {
        for (const [name, infos] of Object.entries(config.values)) {
          collections.push({name, infos});
        }
      }
      if (config.references) {
        for (const [name, infos] of Object.entries(config.references)) {
          collections.push({name, infos});
        }
      }
      const content = workitemUi(fields, collections);
      fs.writeFileSync(filePath, content);
    }
  }

  console.dir(pluginFiles);
  const pluginServiceHandler = require('../templates/serviceHandlers/plugin.js');
  const pluginWidget = require('../templates/plugin/widget.js');
  for (const {type, filePath} of pluginFiles) {
    const config = getEntityConfig(type);
    if (filePath.endsWith('-plugin.js')) {
      const content = pluginServiceHandler(type);
      fs.writeFileSync(filePath, content);
    }
    if (filePath.endsWith('widget.js')) {
      // const content = pluginWidget(config);
      // fs.writeFileSync(filePath, content);
    }
    if (filePath.endsWith('service.js')) {
      const content = workitemService(type);
      fs.writeFileSync(filePath, content);
    }
    if (filePath.endsWith('ui.js')) {
      let fields = [];
      let collections = [];
      if (config.properties) {
        fields = Object.entries(config.properties).map(([name, infos]) => {
          return {name, ...infos};
        });
      }
      if (config.values) {
        for (const [name, infos] of Object.entries(config.values)) {
          collections.push({name, infos});
        }
      }
      if (config.references) {
        for (const [name, infos] of Object.entries(config.references)) {
          collections.push({name, infos});
        }
      }
      const content = workitemUi(fields, collections);
      fs.writeFileSync(filePath, content);
    }
  }
  console.dir(hinterFiles);
  const hinterServiceHandler = require('../templates/serviceHandlers/hinter.js');
  for (const {type, filePath} of hinterFiles) {
    if (filePath.endsWith('-hinter.js')) {
      const content = hinterServiceHandler(type);
      fs.writeFileSync(filePath, content);
    }
  }

  console.dir(searchFiles);
  const searchServiceHandler = require('../templates/serviceHandlers/search.js');
  for (const {type, filePath} of searchFiles) {
    if (filePath.endsWith('-search.js')) {
      const content = searchServiceHandler(type);
      fs.writeFileSync(filePath, content);
    }
  }
});

Goblin.registerQuest(goblinName, 'request-entity-deletion', function(
  quest,
  entityId,
  desktopId
) {
  quest.evt('delete-entity-requested', {entityId, desktopId});
});

Goblin.registerQuest(goblinName, 'create-new-entity', function(
  quest,
  goblinLib,
  entity
) {
  const {projectPath} = require('xcraft-core-host');
  const goblinRoot = path.join(projectPath, 'lib', goblinLib);
  if (!fs.existsSync(goblinRoot)) {
    throw new Error(
      `Cannot generate-workitems in ${goblinRoot}: the folder not exists`
    );
  }

  const entityServiceHandler = require('../templates/serviceHandlers/entity.js');
  const entityService = require('../templates/entity/service.js');
  const entityType = entity.type;

  const serviceHandlerFilePath = path.join(goblinRoot, entityType + '.js');
  const serviceFilePath = path.join(goblinRoot, 'entities', entityType + '.js');

  if (!fs.existsSync(serviceHandlerFilePath)) {
    const content = entityServiceHandler(entityType);
    fs.writeFileSync(serviceHandlerFilePath, content);
  } else {
    throw new Error(
      `Cannot generate-new-entity service handler in ${serviceHandlerFilePath}: the file already exists !`
    );
  }
  if (!fs.existsSync(serviceFilePath)) {
    const content = entityService(entity);
    fs.writeFileSync(serviceFilePath, content);
  } else {
    throw new Error(
      `Cannot generate-new-entity service handler in ${serviceHandlerFilePath}: the file already exists !`
    );
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
