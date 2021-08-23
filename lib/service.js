'use strict';

const moduleName = 'goblin-workshop';

const path = require('path');
const Goblin = require('xcraft-core-goblin');
const fs = require('fs');
const xLog = require('xcraft-core-log')(moduleName, null);
const xConfig = require('xcraft-core-etc')().load('xcraft');

const goblinName = path.basename(module.parent.filename, '.js');
const CryoProcessor = require('./cryo-processor.js');
const workshopConfig = require('xcraft-core-etc')().load('goblin-workshop');
const entityTypes = require('./entity-builder.js').entities;
const entityConfiguration = require('./entity-builder.js').configurations;
const indexBuilder = require('./indexer/indexBuilder.js');
const deleteBuilder = require('./indexer/deleteBuilder.js');
const entityStorage = workshopConfig.entityStorageProvider.replace(
  'goblin-',
  ''
);

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
  init: (state, action) => {
    return state.set('cryo.available', action.get('available'));
  },
  registerSchema: (state, action) => {
    const schema = action.get('schema');
    const type = schema.get('id').split('@', 2)[1];
    return state.set(`schema.${type}`, schema);
  },
  maintenance: (state, action) => {
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

const sendCommand = watt(function* (cmd, data, resp, next) {
  const {BusClient} = require('xcraft-core-busclient');

  const busClient = new BusClient(null, ['*::*']);
  busClient.on('commands.registry', next.parallel());
  busClient.connect('ee', null, next.parallel());
  yield next.sync();

  const orcName = busClient.getOrcName();
  const _resp = busClient.newResponse(`workshop`, orcName);
  const unsub0 = _resp.events.subscribe(`workshop.ripleying`, (msg) => {
    resp.log.progress('ripleying', msg.data.progress, 1.0);
  });
  const unsub1 = _resp.events.subscribe(`workshop.step`, (msg) => {
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
const common = require('./workitems/common.js');
const entityHelperQuests = {
  'get-entity': common.getEntityQuest,
  'get-entities': common.getEntitiesQuest,
};

common.registerQuests(goblinName, entityHelperQuests);

Goblin.registerQuest(goblinName, 'init', function* (
  quest,
  desktopId,
  configuration,
  appName
) {
  quest.goblin.setX('desktopId', 'system');
  // const isUsable = yield quest.cmd(`cryo.usable`);
  /* FIXME: consider that cryo is always usable. We can't send a command here
   * because the horde (cryo) is not initialized.
   */
  quest.do({available: true});

  yield quest.me.loadSchema();
  yield quest.cmd(`graph-loader-queue.init`);
  yield quest.cmd(`activity-monitor.init`);
  yield quest.cmd(`entity-flow-updater.init`);
  yield quest.cmd(`entity-cache-feeder.init`);
  yield quest.cmd(`aggregate-updater.init`);
  yield quest.cmd(`entity-indexer.init`);
  yield quest.cmd(`entity-driller.init`);
  yield quest.cmd(`entity-counter.init`);
  yield quest.cmd(`entity-deleter.init`);
  yield quest.cmd(`entity-exporter.init`);

  if (!configuration.mainGoblin) {
    configuration.mainGoblin = appName;
  }

  quest.goblin.setX('configuration', configuration);

  const entityBuilderConfig = require('goblin-workshop').buildEntity;
  const {
    customIndexesByType,
    orderIndexesByType,
    indexerMappingsByType,
  } = entityBuilderConfig;
  const workshopAPI = quest.getAPI('workshop');
  try {
    yield workshopAPI.initStorage({
      desktopId,
      configuration,
      customIndexesByType,
      orderIndexesByType,
    });
    yield workshopAPI.initIndexer({
      configuration,
      indexerMappingsByType,
    });
  } catch (err) {
    throw new Error(
      `Fatal error occured during system storage initialization, check your storages services: ${
        err.stack || err.message || err
      }`
    );
  }

  const status = {};

  if (quest.hasAPI('nabu')) {
    try {
      const nabuAPI = quest.getAPI('nabu');
      yield nabuAPI.init({
        desktopId,
        appName,
        configuration,
      });
      status.nabu = true;
    } catch (err) {
      throw new Error(
        `Fatal error occured during nabu init: ${
          err.stack || err.message || err
        }`
      );
    }
  }

  try {
    const nabuStoreAPI = quest.getAPI('nabu-store');
    yield nabuStoreAPI.init({
      desktopId,
      appName,
      configuration,
    });
    status.nabuStore = true;
  } catch (err) {
    throw new Error(
      `Fatal error occured during nabu-store init: ${
        err.stack || err.message || err
      }`
    );
  }

  setInterval(function () {
    const last = process.hrtime();
    setImmediate(function () {
      const ntime = process.hrtime(last);
      const delta = (ntime[0] * 1e9 + ntime[1]).toFixed(0);
      /* if greater than 5 [ms] */
      if (delta > 5e6) {
        xLog.warn(
          `\n////////////////// WARNING ////////////////\n` +
            `       EVENT LOOP LAG: ${(delta / 1e6).toFixed(2)} [ms]\n` +
            `////////////////// WARNING ////////////////`
        );
      }
    });
  }, 500);

  //pre-load entities
  yield quest.me.loadWorkitemEntities({desktopId});

  return status;
});

Goblin.registerQuest(goblinName, 'get-configuration', function (quest) {
  return quest.goblin.getX('configuration');
});

Goblin.registerQuest(goblinName, 'load-schema', function* (quest) {
  for (const config of Object.values(configurations)) {
    const serviceId = `entity-schema@${config.type}`;
    yield quest.create(serviceId, {
      id: serviceId,
      desktopId: 'system',
      entityType: config.type,
    });
    const schema = yield quest.warehouse.get({path: serviceId});
    quest.dispatch('registerSchema', {schema});
  }
});

Goblin.registerQuest(goblinName, 'loadWorkitemEntities', function* (
  quest,
  desktopId
) {
  for (const {type} of Object.values(configurations)) {
    //load goblin settings for this workitem
    if (!type.startsWith('workitem@')) {
      quest.log.dbg(`Loading workitem fields for ${type}...`);
      const workitemName = `${type}-workitem`;
      const workitemAPI = yield quest.create(`workitem@${workitemName}`, {
        id: `workitem@${workitemName}`,
        desktopId,
        name: workitemName,
      });
      yield workitemAPI.loadGraph({
        desktopId,
        loadedBy: workitemAPI.id,
        level: 1,
        stopAtLevel: 1,
        skipped: [],
      });
      quest.log.dbg(`Loading workitem fields ${workitemName} [DONE]`);
    }
  }
});

//protect entity creation, usefull for workitem
Goblin.registerQuest(goblinName, 'createEntity', function* (
  quest,
  entityId,
  createFor,
  desktopId,
  entity,
  properties = {},
  ttl
) {
  if (!entityId) {
    throw new Error(`workshop.createEntity: missing entityId`);
  }
  if (!createFor) {
    throw new Error(`workshop.createEntity: missing workitemId`);
  }
  if (!desktopId) {
    throw new Error(`workshop.createEntity: missing desktopId`);
  }
  try {
    yield quest.create(entityId, {
      id: entityId,
      entity,
      ...properties,
      desktopId: quest.getSystemDesktop(),
    });
    if (ttl) {
      yield quest.createFor(createFor, createFor, entityId, {
        id: entityId,
        desktopId,
        _goblinTTL: ttl,
      });
    } else {
      yield quest.createFor(createFor, createFor, entityId, {
        id: entityId,
        desktopId,
      });
    }
  } finally {
    yield quest.kill(entityId);
  }
});

Goblin.registerQuest(goblinName, 'create-hinter-for', function* (
  quest,
  desktopId,
  workitemId,
  detailType,
  detailPath,
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
      detailType,
      detailPath,
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

Goblin.registerQuest(goblinName, 'get-available-entities', function (quest) {
  // TODO: check entity service availability
  // const {projectPath} = require('xcraft-core-host');
  // add suffix '-entity.js' for entity service in a app ?
  return entityTypes;
});

Goblin.registerQuest(goblinName, 'init-storage', function* (
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

  const r = quest.getStorage(entityStorage);
  if (configuration.action === 'reset') {
    yield r.resetDatabase();
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
          indexesFunc: customIndex.customIndexes.map((f) => f.toString()),
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

Goblin.registerQuest(goblinName, 'resetIndex', function* (quest) {
  const {indexerMappingsByType} = require('goblin-workshop').buildEntity;
  const configuration = {...quest.goblin.getX('configuration')};
  configuration.action = 'reset';

  const workshopAPI = quest.getAPI('workshop');
  yield workshopAPI.initIndexer({
    configuration,
    indexerMappingsByType,
  });

  const nabu = yield quest.warehouse.get({path: 'nabu'});
  const locales = nabu.get('locales').toJS();

  const nabuAPI = quest.getAPI('nabu-store');
  yield nabuAPI.handleElasticIndexes({
    locales,
    mandate: configuration.mandate,
    configuration,
  });
});

Goblin.registerQuest(goblinName, 'init-indexer', function* (
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

Goblin.registerQuest(goblinName, 'get-mandate-storage-root-path', function* (
  quest,
  desktopId
) {
  const r = quest.getStorage(entityStorage);
  const mandate = yield r.get({
    table: 'mandate',
    documentId: 'mandate@main',
  });
  let storagePath;
  if (!mandate) {
    storagePath = 'mandateFiles';
  } else {
    if (!mandate.storage || mandate.storage.rootPath === undefined) {
      if (!desktopId.startsWith('system@')) {
        const deskAPI = quest.getAPI(desktopId).noThrow();
        yield deskAPI.addNotification({
          color: 'red',
          message: `Impossible de trouver une configuration de stockage valide
            veuillez configurer le stockage dans admin/options`,
          glyph: 'solid/exclamation-triangle',
        });
      }
      return null;
    }
    storagePath = mandate.storage.rootPath;
  }

  if (!path.isAbsolute(storagePath)) {
    const relPath = storagePath || '';
    const rootDir = path.join(xConfig.xcraftRoot, 'var');
    storagePath = path.join(rootDir, relPath);
    if (storagePath.indexOf(rootDir) === -1) {
      throw new Error('Invalid relative path provided');
    }
    const {mkdir} = require('xcraft-core-fs');
    mkdir(storagePath);
  }

  if (!fs.existsSync(storagePath)) {
    if (!desktopId.startsWith('system@')) {
      const deskAPI = quest.getAPI(desktopId).noThrow();
      yield deskAPI.addNotification({
        color: 'red',
        message: `Le stockage est mal configuré, le chemin ${storagePath}
      n'existe pas!
      Veuillez modifier la configuration du stockage dans admin/options`,
        glyph: 'solid/exclamation-triangle',
      });
    }
    return null;
  }
  return storagePath;
});

Goblin.registerQuest(
  goblinName,
  'get-mandate-storage-server-host-name',
  function* (quest, desktopId) {
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
  function* (quest, desktopId) {
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

Goblin.registerQuest(goblinName, 'reindex-entities-from-storage', function* (
  quest,
  desktopId,
  type,
  status,
  batchSize,
  locales
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
  });

  let done = false;
  let reportData = [];
  while (!done) {
    const entities = yield r.getAll({
      table: type,
      range,
    });
    let indexes = [];
    for (const entity of entities) {
      let body;
      if (entity.meta.status === 'trashed') {
        body = deleteBuilder(
          locales,
          quest.getSession(),
          type,
          entity.id,
          entity
        );
      } else {
        body = yield indexBuilder(
          quest,
          quest.getSession(),
          type,
          entity.id,
          entity,
          entityConfiguration[type]
        );
      }

      if (body) {
        indexes = indexes.concat(body);
      }
    }
    if (indexes.length > 0) {
      const report = yield e.bulk({body: indexes, withInfo: true});
      const {created, updated, failed, deleted} = report;
      const row = {
        type,
        info: `created: ${created} updated: ${updated} failed: ${failed} deleted: ${deleted}`,
      };
      reportData.push(row);
      if (failed > 0) {
        for (const [id, err] of Object.entries(report.errors)) {
          const errRow = {type, info: `id: ${id} error: ${err}`};
          reportData.push(errRow);
        }
      }
    }

    if (range.start + range.length > total) {
      done = true;
    }
    range.start += batchSize;
  }
  return reportData;
});

Goblin.registerQuest(goblinName, 'maintenance', function* (
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

Goblin.registerQuest(goblinName, 'ripley', function* (
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

Goblin.registerQuest(goblinName, 'ripley-for', function* (
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

Goblin.registerQuest(goblinName, 'prepare-ripley', function* (
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

Goblin.registerQuest(goblinName, 'start-ripley', function* (
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

Goblin.registerQuest(goblinName, 'generate-workitems-templates', function (
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

  const getEntityConfig = (type) => {
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

  const tryPushWorkitem = (type) => {
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

  const tryPushPlugin = (type) => {
    const destPath = path.join(widgetsRoot, `plugin-${type}`);
    mkdir(destPath);
    const widgetPath = path.join(destPath, 'widget.js');
    if (!fs.existsSync(widgetPath)) {
      pluginFiles.push({type, filePath: widgetPath});
    }
  };

  const browseCollections = (collection) => {
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

  const hinterServiceHandler = require('../templates/serviceHandlers/hinter.js');
  for (const {type, filePath} of hinterFiles) {
    if (filePath.endsWith('-hinter.js')) {
      const content = hinterServiceHandler(type);
      fs.writeFileSync(filePath, content);
    }
  }

  const searchServiceHandler = require('../templates/serviceHandlers/search.js');
  for (const {type, filePath} of searchFiles) {
    if (filePath.endsWith('-search.js')) {
      const content = searchServiceHandler(type);
      fs.writeFileSync(filePath, content);
    }
  }
});

Goblin.registerQuest(goblinName, 'request-entity-deletion', function (
  quest,
  entityId,
  desktopId
) {
  quest.evt('<delete-entity-requested>', {entityId, desktopId});
});

Goblin.registerQuest(goblinName, 'create-new-entity', function (
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
