'use strict';

const goblinName = 'entity-exporter-worker';
const Goblin = require('xcraft-core-goblin');

// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('id', action.get('id'));
  },
};

Goblin.registerQuest(goblinName, 'create', function (quest) {
  quest.do();
});

Goblin.registerQuest(goblinName, 'export', function* (
  quest,
  type,
  format,
  query
) {
  const id = `${type}-list@${quest.goblin.id}`;
  if (!quest.hasAPI(id)) {
    return;
  }
  quest.log.verb(`Entity Exporter Worker: exporting ...`);
  try {
    const listAPI = yield quest.create(id, {
      id: id,
      desktopId: quest.getSystemDesktop(),
    });

    yield listAPI.selectQuery({value: query});
    switch (format) {
      case 'csv':
        yield listAPI.exportToCsv({skipDownload: true});
        break;
      case 'json':
        yield listAPI.exportToJson({skipDownload: true});
        break;
    }
  } catch (ex) {
    const err = `Entity Exporter Worker: error during export, ${
      ex.stack || ex.message || ex
    }`;
    quest.log.err(err);
    throw new Error(err);
  } finally {
    yield quest.kill([id]);
  }
});

Goblin.registerQuest(goblinName, 'delete', function (quest) {});

module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
