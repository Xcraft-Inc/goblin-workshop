'use strict';

const path = require('path');
const Goblin = require('xcraft-core-goblin');

const goblinName = path.basename(module.parent.filename, '.js');

const logicState = {};
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'ripley', function*(
  quest,
  db,
  timestamp,
  next
) {
  const desktopId = `desktop@${db}@${goblinName}`;

  /* Initialize a new laboratory (carnotzet) */
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

  const configuration = mandates[0];
  configuration.reset = true;
  quest.log.info(
    `Start ripleying on the first mandate found for ${
      configuration.rethinkdbHost
    } and ${configuration.elasticsearchUrl}`
  );

  /* Boot the databases (with reset flag to true) */
  const poly = quest.getAPI('polypheme');
  yield poly.bootDatabases({configuration});

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
      entity.ripley({entity: state}, _next);
    })
  );

  /* Retrieve all actions from the actions (cryo) store */
  yield quest.cmd(`cryo.thaw`, {db});
  yield next.sync();
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
