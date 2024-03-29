'use strict';

const Goblin = require('xcraft-core-goblin');
const goblinName = 'hinter';
// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = require('./logic-handlers.js');
const {SmartId} = require('../../lib/workshop.js');

// Register quest's according rc.json

Goblin.registerQuest(goblinName, 'create', function* (
  quest,
  id,
  desktopId,
  name,
  type,
  title,
  glyph,
  kind,
  detailType,
  detailPath,
  detailResolvePath,
  detailWidget,
  detailKind,
  detailWidth,
  newWorkitem,
  newButtonTitle,
  usePayload,
  withDetails,
  filters
) {
  if (!name) {
    name = type;
  }

  if (!filters) {
    filters = ['published'];
  }

  if (!detailType) {
    detailType = type;
  }

  quest.goblin.setX('filters', filters);

  quest.do({
    id,
    name,
    type,
    title,
    glyph,
    kind,
    newWorkitem,
    newButtonTitle,
    withDetails,
    filters,
  });

  const detailId = `${id.replace(`hinter`, `detail`)}`;
  quest.goblin.setX('detailId', detailId);
  yield quest.create('detail', {
    id: detailId,
    desktopId,
    name,
    type: detailType,
    title,
    detailWidget,
    kind: detailKind,
    width: detailWidth,
  });

  if (!name) {
    name = type;
  }
  quest.goblin.setX('name', name);
  quest.goblin.setX('desktopId', desktopId);
  quest.goblin.setX('newWorkitem', newWorkitem);
  quest.goblin.setX('usePayload', usePayload);
  quest.goblin.setX('type', type);
  quest.goblin.setX('detailType', detailType);
  quest.goblin.setX('detailPath', detailPath || null);
  quest.goblin.setX('detailResolvePath', detailResolvePath || null);
  quest.goblin.setX('withDetails', withDetails);
  quest.goblin.setX('cancel', () => null);

  /*hinter@workitem@id*/
  const ids = quest.goblin.getState().get('id').split('@');
  const workitem = ids[1];
  const workitemId = `${ids[1]}@${ids.slice(2, ids.length).join('@')}`;
  quest.goblin.setX('workitem', workitem);
  quest.goblin.setX('workitemId', workitemId);
  quest.goblin.setX('loaded', {});
  return quest.goblin.id;
});

Goblin.registerQuest(goblinName, 'set-current-detail-entity', function* (
  quest,
  entityId
) {
  const detailType = quest.goblin.getX('detailType');
  const type = quest.goblin.getX('type');
  if (detailType === type) {
    const id = new SmartId(entityId, detailType);
    if (id.isValid()) {
      const detailId = quest.goblin.getX('detailId');
      const detail = quest.getAPI(detailId);
      yield detail.setEntity({entityId});
    }
  } else {
    const path = quest.goblin.getX('detailResolvePath');
    const detailEntityId = yield quest.warehouse.get({
      path: `${entityId}.${path}`,
    });
    if (detailEntityId) {
      const id = new SmartId(detailEntityId, detailType);
      if (id.isValid()) {
        const detailId = quest.goblin.getX('detailId');
        const detail = quest.getAPI(detailId);
        yield detail.setEntity({entityId: detailEntityId});
      }
    }
  }
});

Goblin.registerQuest(goblinName, 'create-new', function (quest, value) {
  const deskId = quest.goblin.getX('desktopId');
  const workitem = quest.goblin.getX('newWorkitem');
  workitem.id = quest.uuidV4();
  workitem.isDone = false;
  workitem.payload = {};
  if (workitem.mapNewValueTo) {
    workitem.payload[workitem.mapNewValueTo] = value;
  }
  quest.evt(`${deskId}.<add-workitem-requested>`, {
    workitem,
    navigate: true,
  });
});

Goblin.registerQuest(goblinName, 'select-row', function* (quest, index, text) {
  quest.log.info(`Select row: ${index}: ${text}`);
  quest.do({index: `${index}`});
  const withDetails = quest.goblin.getX('withDetails');
  if (withDetails) {
    yield quest.me.loadDetail({
      index,
    });
  }
});

Goblin.registerQuest(goblinName, 'next-row', function* (quest) {
  quest.do();
  const withDetails = quest.goblin.getX('withDetails');
  if (withDetails) {
    yield quest.me.loadDetail({
      index: quest.goblin.getState().get('selectedIndex'),
    });
  }
});

Goblin.registerQuest(goblinName, 'prev-row', function* (quest) {
  quest.do();
  const withDetails = quest.goblin.getX('withDetails');
  if (withDetails) {
    yield quest.me.loadDetail({
      index: quest.goblin.getState().get('selectedIndex'),
    });
  }
});

Goblin.registerQuest(goblinName, 'hide', function* (quest) {
  const deskAPI = quest.getAPI(quest.getDesktop()).noThrow();
  yield deskAPI.setHinter({
    hinterId: null,
  });
});

Goblin.registerQuest(goblinName, 'show', function* (quest) {
  const deskAPI = quest.getAPI(quest.getDesktop()).noThrow();
  yield deskAPI.setHinter({
    hinterId: quest.goblin.id,
  });
});

Goblin.registerQuest(goblinName, 'showDetail', function* (quest) {
  const deskAPI = quest.getAPI(quest.getDesktop()).noThrow();
  yield deskAPI.setDetail({
    hinterId: quest.goblin.id,
  });
});

Goblin.registerQuest(goblinName, 'load-detail', function* (quest, index) {
  const detailPath = quest.goblin.getX('detailPath');
  const detailType = quest.goblin.getX('detailType');
  let value = null;
  if (detailPath !== null) {
    value = quest.goblin
      .getState()
      .get(`payloads.${index}.${detailPath}`, null);
  } else {
    value = quest.goblin.getState().get(`values.${index}`, null);
  }

  if (value && detailType) {
    const detail = quest.getAPI(quest.goblin.getX('detailId'), 'detail');
    yield detail.setEntity({entityId: value});
  }
});

Goblin.registerQuest(goblinName, 'validate-row', function* (quest, index) {
  quest.log.info(`Validate row: ${index}`);
  /*hinter@type@workitem@id*/
  const ids = quest.goblin.getState().get('id').split('@');
  const workitem = ids[2];
  const workitemId = `${ids.slice(2, ids.length).join('@')}`;
  const value = quest.goblin.getState().get(`values.${index}`, null);

  let payload = {};
  const usePayload = quest.goblin.getX('usePayload');
  if (usePayload) {
    payload = quest.goblin.getState().get(`payloads.${index}`, null);
    if (payload) {
      payload = payload.toJS();
    }
  }

  const type = quest.goblin.getState().get(`type`, null);
  if (value && type) {
    const name = quest.goblin.getX('name');
    const cmd = `${workitem}.hinter-validate-${name}`;
    if (quest.resp.hasCommand(cmd)) {
      yield quest.cmd(cmd, {
        id: workitemId,
        selection: {index, value, payload},
      });
    }
  }
});

Goblin.registerQuest(goblinName, 'set-filters', function* (quest, filters) {
  quest.goblin.setX('filters', filters);
  const lastSelections = quest.goblin.getX('lastSelections');
  if (lastSelections) {
    yield quest.me.setSelections(lastSelections);
  }
});

Goblin.registerQuest(goblinName, 'set-selections', function* (
  quest,
  rows,
  glyphs,
  status,
  values,
  payloads,
  usePayload,
  validate
) {
  const filters = quest.goblin.getX('filters');
  quest.goblin.setX('lastSelections', {
    rows,
    glyphs,
    status,
    values,
    payloads,
    usePayload,
    validate,
  });
  const indexes = status
    ? status.reduce((indexes, s, i) => {
        if (filters.includes(s) || s === undefined) {
          indexes.push(i);
        }
        return indexes;
      }, [])
    : rows.map((_, i) => i);

  if (indexes.length !== rows.length) {
    rows = rows.filter((_, i) => indexes.includes(i));
    glyphs = glyphs.filter((_, i) => indexes.includes(i));
    values = values.filter((_, i) => indexes.includes(i));
    status = status.filter((_, i) => indexes.includes(i));
    payloads = payloads.filter((_, i) => indexes.includes(i));
  }

  quest.do({rows, glyphs, values, status, payloads});
  if (rows.length > 0) {
    yield quest.me.selectRow({
      index: 0,
      text: rows[0],
      payload: usePayload ? payloads[0] : {},
      usePayload,
    });
    if (validate) {
      yield quest.me.validateRow({
        index: 0,
        text: rows[0],
      });
    }
  }
});

Goblin.registerQuest(goblinName, 'delete', function (quest) {
  quest.log.info('Deleting hinter...');
});

// Create a Goblin with initial state and handlers
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
