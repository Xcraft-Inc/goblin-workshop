'use strict';

const path = require('path');
const watt = require('watt');
const Goblin = require('xcraft-core-goblin');

const goblinName = path.basename(module.parent.filename, '.js');

const logicState = {};
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'ripley', function*(quest, db, timestamp) {
  const desktopId = `desktop@${db}@${quest.uuidV4()}`;

  quest.defer(
    quest.sub(
      `cryo.thawed.${db}`,
      watt(function*(err, entry) {
        const action = JSON.parse(entry.data.action);
        const {state} = action.payload;
        const entity = yield quest.create(`${state.meta.type}`, {
          id: state.id,
          desktopId,
          entity: state,
          status: state.meta.status,
          initialImport: true,
        });
        entity.ripley({entity: state});
      })
    )
  );

  yield quest.cmd(`cryo.thaw`, {db});
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
