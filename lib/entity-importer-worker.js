'use strict';

const goblinName = 'entity-importer-worker';
const Goblin = require('xcraft-core-goblin');
const {configurations} = require('goblin-workshop').buildEntity;
const nabuHelpers = require('goblin-nabu/lib/helpers.js');
const ToNabuObject = require('goblin-nabu/widgets/helpers/t.js');
function WrapT(...args) {
  // Otherwise extractor complains about T not being statically evaluate-able
  return ToNabuObject(...args);
}

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

Goblin.registerQuest(goblinName, 'import', function* (
  quest,
  desktopId,
  type,
  row
) {
  const entity = row.data;
  const entityConfig = configurations[type];
  if (!entityConfig) {
    throw new Error(
      `Entity type '${type}' doesn't exist in schema ! Check filename, it should match an entity type-`
    );
  }

  const entityId = entity.entityId || `${type}@${quest.uuidV4()}`;
  delete entity.entityId;
  const entityAPI = yield quest.create(type, {
    id: entityId,
    desktopId,
  });
  for (const field of Object.keys(entityConfig.properties)) {
    const fieldType = entityConfig.properties[field].type;
    switch (fieldType) {
      case 'translatable': {
        const nabuId = `${entityId}.${field}`;
        yield quest.cmd('nabu.add-message', {
          desktopId,
          nabuId,
          description: '',
          custom: true,
          workitemId: quest.goblin.id,
        });
        const messageId = nabuHelpers.computeMessageId(nabuId);
        yield quest.cmd('nabu.reset-translations', {
          desktopId,
          ownerId: null,
          messageId,
        });
        const translations = entity[field].split('|');
        for (const translation of translations) {
          const localeName = translation.substring(0, 5);
          const value = translation.substring(6);
          yield quest.cmd('nabu.set-translatable-data-translation', {
            desktopId,
            nabuId,
            localeName,
            translation: value,
          });
        }
        entity[field] = WrapT(nabuId, null, null, null, true);
        break;
      }
      case 'enum': {
        if (!entityConfig.properties[field].values.includes(entity[field])) {
          entity[field] = entityConfig.properties[field].defaultValue;
        }
        break;
      }
      default:
        break;
    }
  }
  yield entityAPI.apply({patch: entity});
  yield entityAPI.publishEntity();
});

Goblin.registerQuest(goblinName, 'delete', function (quest) {});

module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
