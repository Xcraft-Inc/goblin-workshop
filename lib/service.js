'use strict';

const path = require('path');
const Goblin = require('xcraft-core-goblin');

const goblinName = path.basename(module.parent.filename, '.js');

const logicState = {};
const logicHandlers = {};

const watt = require('watt');

const sendCommand = watt(function*(cmd, data, resp, next) {
  const {BusClient} = require('xcraft-core-busclient');

  const busClient = new BusClient(null, ['*::*']);
  busClient.on('commands.registry', next.parallel());
  busClient.connect('ee', null, next.parallel());
  yield next.sync();

  const _resp = busClient.newResponse(`workshop`, busClient.getOrcName());
  const unsub0 = _resp.events.subscribe('workshop.ripleying', msg => {
    resp.log.progress('ripleying', msg.data.position, msg.data.length);
  });
  const unsub1 = _resp.events.subscribe('workshop.step', msg => {
    resp.log.info(`ripley: ${msg.data}`);
  });

  yield _resp.command.send(cmd, data, next);

  unsub0();
  unsub1();
  yield busClient.stop(next);
});

Goblin.registerQuest(goblinName, 'ripley', function*(quest, db, timestamp) {
  return yield sendCommand('workshop._ripley', {db, timestamp}, quest.resp);
});

Goblin.registerQuest(goblinName, '_ripley', function*(
  quest,
  db,
  timestamp,
  $msg,
  next
) {
  quest.defer(() => {
    quest.warehouse.maintenance(
      {
        enable: false,
        description: null,
        orcName: $msg.orcName,
      },
      () => quest.evt('maintenance', false)
    );
  });
  yield quest.warehouse.maintenance({
    enable: true,
    description: 'Ripleying',
    orcName: $msg.orcName,
  });

  quest.evt('maintenance', true);

  const desktopId = `desktop@${db}@${goblinName}`;

  /* Initialize a new laboratory (carnotzet) */
  quest.evt('step', 'open the carnotzet');
  const carnotzetId = `carnotzet@${goblinName}`;
  yield quest.createFor('carnotzet', carnotzetId, carnotzetId, {
    id: carnotzetId,
    config: {feed: carnotzetId},
  });
  quest.defer(() => quest.release(carnotzetId));

  /* Create a configurator in order to retrieve the mandate settings */
  const confId = `configurator@${goblinName}`;
  yield quest.createFor('configurator', confId, confId, {
    id: confId,
    desktopId,
  });
  quest.defer(() => quest.release(confId));

  const confs = yield quest.warehouse.get({path: confId});

  const mandates = Object.keys(confs.profiles)
    .filter(profile => confs.profiles[profile].mandate === db)
    .map(profile => confs.profiles[profile]);

  if (mandates.length < 1) {
    throw new Error(`Nothing can be ripleyed because ${db} is not available`);
  }

  quest.evt('step', `mandate '${db}' found`);

  const configuration = mandates[0];
  configuration.reset = true;
  quest.log.info(
    `Start ripleying on the first mandate found for ${
      configuration.rethinkdbHost
    } and ${configuration.elasticsearchUrl}`
  );

  /* Boot the databases (with reset flag to true) */
  quest.evt('step', `reset the '${db}' databases`);
  const poly = quest.getAPI('polypheme');
  yield poly.bootDatabases({configuration});

  quest.evt('step', `ripleying...`);

  let i = 0;
  const stats = yield quest.cmd(`cryo.frozen`, {db, timestamp});

  quest.defer(
    quest.sub(`cryo.thawed.${db}`, function*(err, entry) {
      const _next = next.parallel();
      const action = JSON.parse(entry.data.action);
      const {state} = action.payload;
      /* Create the entity accordingly to the action.
       * If the entity already exists, nothing is changed.
       */
      const entity = yield quest.createFor(
        `${state.meta.type}`,
        state.id,
        state.id,
        {
          id: state.id,
          desktopId,
          entity: state,
          status: state.meta.status,
          initialImport: true,
        }
      );
      quest.defer(() => quest.release(state.id));
      /* Apply the new state.
       * Note that it's useless if the entity is new...
       */
      entity.replace({entity: state}, _next);

      if (!(i % 10)) {
        quest.evt('ripleying', {position: i, length: stats.count});
      }
      ++i;
    })
  );

  /* Retrieve all actions from the actions (cryo) store */
  yield quest.cmd(`cryo.thaw`, {db, timestamp});
  yield next.sync();

  quest.evt('ripleying', {position: stats.count, length: stats.count});
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
