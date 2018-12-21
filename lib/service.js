'use strict';

const path = require('path');
const Goblin = require('xcraft-core-goblin');
const fs = require('fs');
const xConfig = require('xcraft-core-etc')().load('xcraft');
const _ = require('lodash');
const goblinName = path.basename(module.parent.filename, '.js');
const Shredder = require('xcraft-core-shredder');
const {fetchValues} = require('./entity-builder/peers.js');

const logicState = {
  id: goblinName,
  maintenance: {
    status: 'off', // off, soft, hard
    progress: null,
    message: null,
  },
  cryo: {
    available: false,
  },
};

const logicHandlers = {
  init: (state, action) => state.set('cryo.available', action.get('available')),
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
  busClient.connect(
    'ee',
    null,
    next.parallel()
  );
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

Goblin.registerQuest(goblinName, 'init', function*(quest) {
  const isUsable = yield quest.cmd(`cryo.usable`);
  quest.do({available: isUsable});
  yield quest.cmd(`entity-flow-updater.init`);
  yield quest.cmd(`entity-cache-feeder.init`);
  yield quest.cmd(`graph-loader.init`);
  yield quest.cmd(`quest-runner.init`);
  yield quest.cmd(`aggregate-updater.init`);
  yield quest.cmd(`workitem-updater.init`);
});

Goblin.registerQuest(goblinName, 'get-mandate-storage-root-path', function*(
  quest,
  desktopId
) {
  const deskAPI = quest.getAPI(desktopId);
  const r = quest.getStorage('rethink');
  const mandate = yield r.get({
    table: 'mandate',
    documentId: 'mandate@main',
  });

  if (!mandate || !mandate.storage) {
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

//WIP: BATCHING OPERATIONS
Goblin.registerQuest(goblinName, 'trash-entities', function*(
  quest,
  type,
  entityIds
) {
  const r = quest.getStorage('rethink');
  const entities = yield r.getAll({table: type, documents: entityIds});
  //TODO: call entity flow workers
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
  return yield sendCommand(
    'workshop.prepare-ripley',
    {dbSrc, dbDst, timestamp},
    quest.resp
  );
});

Goblin.registerQuest(goblinName, 'prepare-ripley', function*(
  quest,
  dbSrc,
  dbDst,
  timestamp
) {
  try {
    yield quest.me.maintenance({status: 'hard', message: 'Ripleying'});
    yield quest.me.startRipley({dbSrc, dbDst, timestamp});
  } finally {
    yield quest.me.maintenance({status: 'off'});
  }
});

Goblin.registerQuest(goblinName, 'start-ripley', function*(
  quest,
  dbSrc,
  dbDst,
  timestamp,
  next
) {
  const mandateDst = dbDst.split('.')[0];
  const desktopId = `desktop@${mandateDst}@${goblinName}`;

  /* Initialize a new laboratory (carnotzet) */
  quest.evt('step', 'open the carnotzet');
  const carnotzetId = `carnotzet@${goblinName}`;
  quest.defer(() => quest.release(carnotzetId));
  yield quest.create(carnotzetId, {
    id: carnotzetId,
    config: {feed: carnotzetId, feeds: []},
    _goblinFeed: {[carnotzetId]: true},
  });

  /* Create a configurator in order to retrieve the mandate settings */
  const confId = `configurator@${goblinName}`;
  quest.defer(() => quest.release(confId));
  yield quest.createFor('configurator', confId, confId, {
    id: confId,
    desktopId,
  });

  const confs = yield quest.warehouse.get({path: confId});

  const mandates = confs
    .get('profiles')
    .valueSeq()
    .filter(profile => profile.get('mandate') === mandateDst)
    .toArray();

  if (mandates.length < 1) {
    throw new Error(
      `Nothing can be ripleyed because ${mandateDst} is not available`
    );
  }

  quest.evt('step', `mandate '${mandateDst}' found`);

  const configuration = mandates[0].toJS();
  configuration.mandate = dbDst;
  configuration.reset = true;
  configuration.skipBranch = true;
  quest.log.info(
    `Start ripleying on the first mandate found for ${
      configuration.rethinkdbHost
    } and ${configuration.elasticsearchUrl}`
  );

  const stats = yield quest.cmd(`cryo.frozen`, {db: dbSrc, timestamp});
  if (!stats.count) {
    return;
  }

  /* Save the previous actions store in a new branch */
  if (dbSrc !== dbDst) {
    yield quest.cmd(`cryo.branch`, {db: dbDst});
  }

  /* Boot the databases (with reset flag to true) */
  quest.me.maintenance({
    status: 'hard',
    message: 'Reset the databases',
  });
  quest.evt('step', `reset the '${dbDst}' databases`);
  const poly = quest.getAPI('polypheme');
  yield poly.bootDatabases({configuration});

  quest.evt('step', `ripleying ...`);

  let position = 0;

  quest.evt('step', `... for a total of ${stats.count} actions`);

  const _next = next.parallel();
  quest.goblin.setX('desktopId', desktopId);
  const r = quest.getStorage('rethink');
  const documentsByTypes = {};
  quest.defer(
    quest.sub(`cryo.thawed.${dbSrc}`, function(err, entry) {
      const action = JSON.parse(entry.data.action);
      const {state} = action.payload;

      if (!documentsByTypes[state.meta.type]) {
        documentsByTypes[state.meta.type] = [];
      }
      documentsByTypes[state.meta.type].push(state);
      ++position;
      if (position === stats.count) {
        _next();
      }
    })
  );

  /* Retrieve all actions from the actions (cryo) store */
  yield quest.me.maintenance({status: 'hard', message: 'Thaw Ellen Ripley'});
  yield quest.cmd(`cryo.thaw`, {db: dbSrc, timestamp});
  yield next.sync();

  const missingDocByTypes = {};

  for (const type of Object.keys(documentsByTypes)) {
    yield quest.me.maintenance({
      status: 'hard',
      message: `Inserting ${
        Object.keys(documentsByTypes[type]).length
      } ${type}(s)`,
    });
    r.set(
      {
        table: type,
        documents: documentsByTypes[type],
      },
      next.parallel()
    );
    yield next.sync();
  }

  // CHECKUP
  for (const type of Object.keys(documentsByTypes)) {
    for (const state of documentsByTypes[type]) {
      const entity = new Shredder(state);
      const values = entity.get('meta.values');
      const toCheck = {};

      if (!values) {
        continue;
      }

      for (const path of values.keys()) {
        fetchValues(quest, toCheck, entity, values, path, true);
      }

      if (!toCheck) {
        continue;
      }

      for (const values of Object.values(toCheck)) {
        if (!values) {
          continue;
        }

        const valuesToFetch = [];
        let type = null;
        const entities = Object.values(values);
        for (const entity of entities) {
          const entityId = entity.get('id');
          if (!type) {
            type = entityId.split('@')[0];
          }
          valuesToFetch.push(entityId);
        }
        if (type) {
          const existing = yield r.getAll({
            table: type,
            documents: valuesToFetch,
            sync: true,
          });
          if (existing.length !== valuesToFetch.length) {
            if (!missingDocByTypes[type]) {
              missingDocByTypes[type] = [];
            }
            missingDocByTypes[type] = missingDocByTypes[type].concat(
              entities.map(e => e.toJS())
            );
          }
        }
      }
    }
  }

  for (const type of Object.keys(missingDocByTypes)) {
    yield quest.me.maintenance({
      status: 'hard',
      message: `Inserting missing ${
        Object.keys(missingDocByTypes[type]).length
      } ${type}(s)`,
    });
    r.set(
      {
        table: type,
        documents: missingDocByTypes[type],
      },
      next.parallel()
    );
    yield next.sync();
  }

  /* Copy the src actions store as destination store */
  yield quest.cmd(`cryo.restore`, {dbSrc, dbDst, timestamp});

  quest.evt('ripleying', {progress: 1.0});
  yield quest.me.maintenance({progress: 1.0});
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
