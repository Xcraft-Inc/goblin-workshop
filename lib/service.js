'use strict';

const path = require('path');
const Goblin = require('xcraft-core-goblin');

const goblinName = path.basename(module.parent.filename, '.js');

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

const watt = require('watt');

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

Goblin.registerQuest(goblinName, 'init', function*(quest) {
  const isUsable = yield quest.cmd(`cryo.usable`);
  quest.do({available: isUsable});
});

Goblin.registerQuest(goblinName, 'maintenance', function(
  quest,
  status,
  progress,
  message
) {
  quest.do();
});

Goblin.registerQuest(goblinName, 'ripley', function*(
  quest,
  dbSrc,
  dbDst,
  timestamp
) {
  return yield sendCommand(
    'workshop._ripley',
    {dbSrc, dbDst, timestamp},
    quest.resp
  );
});

Goblin.registerQuest(goblinName, '_ripley', function*(
  quest,
  dbSrc,
  dbDst,
  timestamp,
  $msg,
  next
) {
  const message = 'Ripleying';
  quest.defer(() => {
    quest.warehouse.maintenance(
      {
        enable: false,
        description: null,
        orcName: $msg.orcName,
      },
      () => {
        quest.me.maintenance({status: 'off'});
        quest.evt('maintenance', 'off');
      }
    );
  });
  yield quest.warehouse.maintenance({
    enable: true,
    description: message,
    orcName: $msg.orcName,
  });
  quest.evt('maintenance', 'hard');
  quest.me.maintenance({status: 'hard', description: message});

  const mandateDst = dbDst.split('.')[0];

  const desktopId = `desktop@${mandateDst}@${goblinName}`;

  /* Initialize a new laboratory (carnotzet) */
  quest.evt('step', 'open the carnotzet');
  const carnotzetId = `carnotzet@${goblinName}`;
  quest.defer(() => quest.release(carnotzetId));
  yield quest.createFor('carnotzet', carnotzetId, carnotzetId, {
    id: carnotzetId,
    config: {feed: carnotzetId},
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
  quest.log.info(
    `Start ripleying on the first mandate found for ${
      configuration.rethinkdbHost
    } and ${configuration.elasticsearchUrl}`
  );

  const stats = yield quest.cmd(`cryo.frozen`, {db: dbSrc, timestamp});

  /* Save the previous actions store in a new branch */
  if (dbSrc !== dbDst || timestamp < stats.timestamp) {
    yield quest.cmd(`cryo.branch`, {db: dbDst});
  }

  /* Boot the databases (with reset flag to true) */
  quest.evt('step', `reset the '${dbDst}' databases`);
  const poly = quest.getAPI('polypheme');
  yield poly.bootDatabases({configuration});

  quest.evt('step', `ripleying ...`);

  let position = 0;

  quest.evt('step', `... for a total of ${stats.count} actions`);

  quest.defer(
    quest.sub(`cryo.thawed.${dbSrc}`, function*(err, entry) {
      const _next = next.parallel();
      const action = JSON.parse(entry.data.action);
      const {state} = action.payload;
      const entity = new Goblin.Shredder(state);

      /* Create the entity accordingly to the action.
       * If the entity already exists, nothing is changed.
       */
      quest.defer(() => quest.release(state.id));
      const e = yield quest.createFor(
        `${state.meta.type}`,
        state.id,
        state.id,
        {
          id: state.id,
          desktopId,
          entity,
          status: state.meta.status,
          initialImport: true,
        }
      );
      /* Apply the new state.
       * Note that it's useless if the entity is new...
       */
      yield e.replace({entity});

      const progress = position / stats.count;

      quest.evt('ripleying', {progress});
      yield quest.me.maintenance({progress});

      ++position;
      _next();
    })
  );

  /* Retrieve all actions from the actions (cryo) store */
  yield quest.cmd(`cryo.thaw`, {db: dbSrc, timestamp});
  yield next.sync();

  /* Copy the src actions store as destination store */
  if (timestamp < stats.timestamp) {
    yield quest.cmd(`cryo.restore`, {dbSrc, dbDst, timestamp});
  }

  quest.evt('ripleying', {progress: 1.0});
  yield quest.me.maintenance({progress: 1.0});
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
