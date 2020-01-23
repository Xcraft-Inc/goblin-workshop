'use strict';

const goblinName = 'entity-schema';
const Goblin = require('xcraft-core-goblin');
const {configurations} = require('goblin-workshop').buildEntity;
// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('', {id: action.get('id'), ...action.get('schema')});
  },
};

Goblin.registerQuest(goblinName, 'create', function(
  quest,
  desktopId,
  entityType
) {
  const config = configurations[entityType];
  if (!config) {
    throw new Error(
      'Unable to create entity-schema for ',
      entityType,
      ' unknow entity ?!'
    );
  }
  if (!config.properties) {
    throw new Error(
      'Unable to create entity-schema for ',
      entityType,
      ' no properties defined in config!'
    );
  }
  quest.goblin.setX('desktopId', desktopId);

  let schema = {meta: {summaries: {info: 'string'}}};
  if (config.computer) {
    schema.sums = {base: 'price', cost: 'price', reward: 'price'};
  }

  schema = Object.entries(config.properties).reduce((schema, [prop, info]) => {
    schema[prop] = info.type || 'string';
    return schema;
  }, schema);

  quest.do({schema});
  return quest.goblin.id;
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
