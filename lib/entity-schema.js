'use strict';

const goblinName = 'entity-schema';
const os = require('os');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const Goblin = require('xcraft-core-goblin');
const {configurations} = require('goblin-workshop').buildEntity;
const checkEntity = require('./middlewares/checkEntity.js');
const normalizeEntity = require('./middlewares/normalizeEntity.js');
const typeList = require('./typeList.js');
// Define initial logic values
const logicState = {};
const managedTypes = typeList;

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('', {id: action.get('id'), ...action.get('schema')});
  },
};

const getAllEntitiesByType = (r, dbName, entityType) => {
  return r.db(dbName).table(entityType);
};

const insertCleanedEntities = (r, dbName, entityType, cleanedEntities) => {
  return r
    .db(dbName)
    .table(entityType)
    .insert(cleanedEntities, {upsert: true})
    .run();
};

Goblin.registerQuest(goblinName, 'create', function(
  quest,
  desktopId,
  entityType
) {
  const config = configurations[entityType];
  if (!config) {
    throw new Error(
      `Unable to create entity-schema for ${entityType}
       unknow entity ?!`
    );
  }
  if (!config.properties) {
    throw new Error(
      `Unable to create entity-schema for ${entityType}
      no properties defined in config!`
    );
  }
  quest.goblin.setX('desktopId', desktopId);
  quest.goblin.setX('entityType', entityType);

  const checkInfo = kind => (prop, info) => {
    if (info.type === undefined) {
      throw new Error(`Error in schema of: ${entityType}
      missing type info for ${kind}: ${prop}`);
    }
    if (info.defaultValue === undefined) {
      throw new Error(`Error in schema of: ${entityType}
      missing default value for ${kind}: ${prop}`);
    }

    if (!managedTypes.includes(info.type)) {
      throw new Error(`Error in schema of: ${entityType}
          unknow type for ${kind}: ${prop}`);
    }

    switch (info.type) {
      case 'enum':
        if (info.values === undefined) {
          throw new Error(`Error in schema of: ${entityType}
          missing enum values for ${kind}: ${prop}`);
        }
        if (!Array.isArray(info.values)) {
          throw new Error(`Error in schema of: ${entityType}
          enum values is not an Array for ${kind}: ${prop}`);
        }
        if (info.values.length === 0) {
          throw new Error(`Error in schema of: ${entityType}
          empty enum values  for ${kind}: ${prop}`);
        }
        break;
    }
  };

  const checkSummaries = checkInfo('summaries');
  const checkSums = checkInfo('sums');
  const checkProp = checkInfo('properties');

  //todo: meta data schema
  let schema = {meta: {}};

  if (config.buildSummaries) {
    if (config.summaries === undefined) {
      throw new Error(`Error in schema of: ${entityType}
        no summaries definition found in configuration`);
    }
    schema.meta.summaries = {};
    schema = Object.entries(config.summaries).reduce((schema, [prop, info]) => {
      checkSummaries(prop, info);
      schema.meta.summaries[prop] = info;
      return schema;
    }, schema);
  }

  if (config.computer) {
    if (config.sums === undefined) {
      throw new Error(`Error in schema of: ${entityType}
      no sums definition found in configuration`);
    }
    schema.sums = {};
    schema = Object.entries(config.sums).reduce((schema, [prop, info]) => {
      checkSums(prop, info);
      schema.sums[prop] = info;
      return schema;
    }, schema);
  }

  schema = Object.entries(config.properties).reduce((schema, [prop, info]) => {
    checkProp(prop, info);
    schema[prop] = info;
    return schema;
  }, schema);

  quest.do({schema});
  return quest.goblin.id;
});

Goblin.registerQuest(goblinName, 'checkEntities', function*(
  quest,
  desktopId,
  batchSize = 1000
) {
  const r = quest.getStorage('rethink');
  const table = quest.goblin.getX('entityType');
  const filePath = path.join(os.tmpdir(), `${table}-check-report.csv`);
  const data = [];
  const reporter = (topic, entityId, path, message) => {
    data.push({topic, entityId, path, message});
  };

  let from = 0;
  const numberOfEntities = yield r.count({table});

  while (from + batchSize <= numberOfEntities) {
    const entities = yield r.getAll({
      table,
      range: {start: from, length: batchSize},
    });
    for (const entity of Object.values(entities)) {
      checkEntity(entity, reporter);
    }
    from += batchSize;
  }

  const rows = Papa.unparse({
    data,
  });
  fs.writeFileSync(filePath, rows);

  const deskAPI = quest.getAPI(desktopId);
  yield deskAPI.downloadFile({filePath, openFile: true});
});

Goblin.registerQuest(goblinName, 'cleanEntities', function*(
  quest,
  desktopId,
  entityType
) {
  const r = quest.getStorage('rethink');
  const dbName = quest.getSession();
  const entities = yield r.query({
    query: getAllEntitiesByType,
    args: [dbName, entityType],
  });
  const cleanedEntities = [];
  for (const entity of Object.values(entities)) {
    cleanedEntities.push(normalizeEntity(entity));
  }

  const result = yield r.query({
    query: insertCleanedEntities,
    args: [entityType, cleanedEntities],
  });
  return result;
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
