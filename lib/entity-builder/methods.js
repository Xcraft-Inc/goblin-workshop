//////////////////////////////////////////////
/// Build user friendly methods quest for entity ref/val
///
/// for manipulating single element in collections
/// (convention use type as element, in this ex. Todo)
/// addTodo
/// addNewTodo
/// addCopyTodo
/// moveTodo
/// removeTodo
///
/// for manipulating pointer/collections
/// (convention use prop name in entity, in this ex. TodoId /TodoIds)
/// setTodoId
/// clearTodoIds
const Goblin = require('xcraft-core-goblin');
const common = require('../workitems/common.js');

const buildReferencesQuests = references => {
  const refQuests = {};
  for (const path in references) {
    const ref = references[path];

    if (common.referenceUseArity(ref)) {
      const type = common.getReferenceType(ref);

      refQuests[`add-${type}`] = function(quest, entityId, beforeId) {
        quest.me.addRef({path, entityId, beforeId});
      };

      refQuests[`add-copy-${type}`] = function*(
        quest,
        entityId,
        entity,
        deepCopy,
        beforeId
      ) {
        if (!entity) {
          entity = yield quest.me.getEntity({entityId});
        } else {
          entity = new Goblin.Shredder(entity);
        }
        const id = yield quest.me.addCopyVal({
          path,
          type,
          entityId: entityId || entity.get('id'),
          entity,
          deepCopy: deepCopy !== undefined ? deepCopy : true,
          beforeId,
          asRoot: true,
        });
        return id;
      };

      refQuests[`remove-${type}`] = function(quest, entityId) {
        quest.me.removeRef({path, entityId});
      };

      refQuests[`move-${type}`] = function(
        quest,
        id,
        entityId,
        beforeEntityId
      ) {
        quest.me.moveRef({path, entityId, beforeEntityId});
      };

      refQuests[`clear-${path}`] = function*(quest) {
        quest.dispatch('clear-ref', {path, value: []});
        quest.evt('plugin', {eventType: 'cleared', type: type});
        yield quest.me.hydrate();
        quest.me.persist();
      };
    } else {
      //Entity case
      refQuests[`set-${path}`] = function(quest, entityId) {
        quest.me.setRef({path, entityId});
      };
    }
  }
  return refQuests;
};

const buildValuesQuests = values => {
  const valQuests = {};
  for (const path in values) {
    const val = values[path];

    if (common.referenceUseArity(val)) {
      const type = common.getReferenceType(val);

      valQuests[`add-new-${type}`] = function*(
        quest,
        payload,
        parentEntity,
        beforeId
      ) {
        if (!parentEntity) {
          parentEntity = quest.goblin.id;
        }
        const id = yield quest.me.addNewVal({
          path,
          type,
          payload,
          parentEntity,
          beforeId,
        });
        return id;
      };

      valQuests[`add-copy-${type}`] = function*(
        quest,
        entityId,
        entity,
        deepCopy,
        beforeId
      ) {
        if (!entity) {
          entity = yield quest.me.getEntity({entityId});
        } else {
          entity = new Goblin.Shredder(entity);
        }
        const id = yield quest.me.addCopyVal({
          path,
          type,
          entityId: entityId || entity.get('id'),
          entity,
          deepCopy: deepCopy !== undefined ? deepCopy : true,
          beforeId,
          asRoot: false,
        });
        return id;
      };

      valQuests[`add-${type}`] = function*(quest, entityId, entity, beforeId) {
        if (entity) {
          yield quest.me.addVal({path, entity, beforeId});
        } else {
          if (!entityId) {
            throw new Error(
              'Cannot add value ',
              type,
              ' in ',
              quest.goblin.id,
              ' missing or undefined entity or entityId'
            );
          }
          const entity = yield quest.me.getEntity({entityId});
          yield quest.me.addVal({path, entity, beforeId});
        }
      };

      valQuests[`remove-${type}`] = function*(quest, entityId, entity) {
        if (!entityId) {
          if (entity) {
            entityId = entity.id;
          } else {
            throw new Error(
              'Cannot remove value ',
              type,
              ' in ',
              quest.goblin.id,
              ' missing or undefined entity or entityId'
            );
          }
        }
        if (!entity) {
          entity = yield quest.me.getEntity({entityId});
        }
        yield quest.me.removeVal({path, entityId, entity});
      };

      valQuests[`move-${type}`] = function*(
        quest,
        id,
        entityId,
        beforeEntityId
      ) {
        yield quest.me.moveVal({path, entityId, beforeEntityId});
      };

      valQuests[`clear-${path}`] = function*(quest) {
        quest.dispatch('clear-val', {path, value: []});
        quest.evt('plugin', {eventType: 'cleared', type: type});
        yield quest.me.hydrate();
        quest.me.persist();
      };
    } else {
      //Entity case
      valQuests[`set-${path}`] = function*(quest, entityId, entity) {
        if (entity) {
          yield quest.me.setVal({path, entity});
        } else {
          if (!entityId) {
            return;
          }
          const entity = yield quest.me.getEntity({entityId});
          yield quest.me.setVal({path, entity});
        }
      };
    }
  }
  return valQuests;
};

module.exports = {
  buildReferencesQuests,
  buildValuesQuests,
};
