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
};
const schemaPropsList = ['references', 'values', 'properties'];
const logicHandlers = {
  init: (state, action) => {
    const schema = Object.entries(action.get('configurations')).reduce(
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
    );
    return state
      .set('cryo.available', action.get('available'))
      .set('schema', schema);
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
  quest.do({available: true, configurations});
  yield quest.cmd(`entity-flow-updater.init`);
  yield quest.cmd(`entity-cache-feeder.init`);
  yield quest.cmd(`aggregate-updater.init`);
  yield quest.cmd(`entity-driller.init`);
  yield quest.cmd(`entity-counter.init`);
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

Goblin.registerQuest(goblinName, 'init-storage', function*(
  quest,
  desktopId,
  configuration,
  customIndexesByType,
  orderIndexesByType,
  next
) {
  const r = quest.getStorage('rethink');
  if (configuration.action === 'reset') {
    yield r.resetDatabase();
  } else {
    yield r.ensureDatabase();
  }

  yield r.ensureTable({table: 'deleted'});
  yield r.ensureIndex({table: 'deleted'});

  if (entityTypes) {
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
  next
) {
  const reset = configuration.action === 'reset';
  if (!indexes) {
    const index = configuration.mandate;
    const elasticId = `elastic@${index}`;
    const e = yield quest.create(elasticId, {
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
      const e = yield quest.create(elasticId, {
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
  const mkdirp = require('mkdirp').sync;
  const configurations = require('./entity-builder.js').configurations;
  const common = require('./workitems/common.js');
  const goblinRoot = path.join(projectPath, 'lib', goblinLib);
  if (!fs.existsSync(goblinRoot)) {
    throw new Error(
      `Cannot generate-workitems in ${goblinRoot}: the folder not exists`
    );
  }

  const widgetsRoot = path.join(goblinRoot, 'widgets');
  if (!fs.existsSync(goblinRoot)) {
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
    mkdirp(destPath);
    const servicePath = path.join(destPath, 'service.js');
    if (!fs.existsSync(servicePath)) {
      workitemFiles.push({type, filePath: servicePath});
    }
    const uiPath = path.join(destPath, 'ui.js');
    if (!fs.existsSync(uiPath)) {
      workitemFiles.push({type, filePath: uiPath});
    }
  };

  const browseCollections = collection => {
    for (const ref of Object.values(collection)) {
      const type = common.getReferenceType(ref);

      tryPushServiceHandlerFile(type, 'workitem', workitemFiles);
      tryPushWorkitem(type);

      if (common.referenceUseArity(ref)) {
        tryPushServiceHandlerFile(type, 'plugin', pluginFiles);
      } else {
        const refConfig = getEntityConfig(type);
        if (refConfig.indexer) {
          tryPushServiceHandlerFile(type, 'hinter', hinterFiles);
        }
      }
    }
  };

  tryPushServiceHandlerFile(rootEntityConfig.type, 'workitem', workitemFiles);
  tryPushWorkitem(rootEntityConfig.type);

  if (rootEntityConfig.indexer) {
    const filePath = path.join(
      goblinRoot,
      `${rootEntityConfig.type}-search.js`
    );
    tryPushServiceHandlerFile(filePath, searchFiles);
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
  for (const {type, filePath} of pluginFiles) {
    const config = getEntityConfig(type);
    if (filePath.endsWith('-plugin.js')) {
      const content = pluginServiceHandler(type);
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

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
