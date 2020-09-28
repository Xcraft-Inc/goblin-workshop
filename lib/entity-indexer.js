'use strict';

const goblinName = 'entity-indexer';
const Goblin = require('xcraft-core-goblin');
const {ArrayCollector, EventDebouncer} = require('xcraft-core-utils');

// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(
  goblinName,
  'init',
  function (quest) {
    console.log(
      '\x1b[32m%s\x1b[0m',
      'Goblin-Workshop: Entity Indexer [RUNNING]'
    );

    const onCollect = function* (collected, resp, next) {
      for (const [desktopId, data] of Object.entries(collected)) {
        const body = data;
        yield resp.command.send(`${goblinName}.bulk`, {desktopId, body}, next);
      }
    };

    const collector = new ArrayCollector(1000, onCollect);
    quest.goblin.defer(
      quest.sub('*::*.index-entity-requested', function (err, {msg}) {
        const {desktopId, body} = msg.data;
        if (body.length === 0) {
          console.warn('empty index-entity-request');
          return;
        }
        collector.grab(desktopId, body);
      })
    );

    const evtDebouncer = new EventDebouncer(1000);
    quest.goblin.setX('evtDebouncer', evtDebouncer);
  },
  ['*::*.index-entity-requested']
);

Goblin.registerQuest(goblinName, 'bulk', function* (quest, desktopId, body) {
  const e = quest.getStorage('elastic');
  const infoByType = yield e.bulk({body, withInfo: true, byType: true});

  const evtDebouncer = quest.goblin.getX('evtDebouncer');
  for (const [type, res] of Object.entries(infoByType)) {
    const {created, updated, deleted} = res;
    if (created > 0 || deleted > 0 || updated > 0) {
      evtDebouncer.publish(`${type}-index-changed`);
    }
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
