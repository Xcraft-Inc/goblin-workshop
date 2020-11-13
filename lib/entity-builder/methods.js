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

const buildReferencesQuests = (references, rehydrate) => {
  const refQuests = {};
  for (const path in references) {
    const ref = references[path];

    if (common.referenceUseArity(ref)) {
      const type = common.getReferenceType(ref);

      refQuests[`add-to-${path}`] = function* (quest, entityId, beforeId) {
        yield quest.me.addRef({path, entityId, beforeId});
      };

      refQuests[`copy-${path}`] = function* (
        quest,
        entityId,
        entityPath,
        entity
      ) {
        if (!entityPath) {
          entityPath = path;
        }
        if (entityPath.startsWith('private.')) {
          throw new Error(
            `copying sub private references (${entityPath}) is forbidden`
          );
        }
        if (!entity) {
          entity = yield quest.me.getEntity({entityId});
        } else {
          entity = new Goblin.Shredder(entity);
        }
        const entityIds = entity.get(entityPath).toArray();
        yield quest.me.copyCollectionByRef({path, entityIds});
      };

      refQuests[`add-copy-${path}`] = function* (
        quest,
        entityId,
        entity,
        deepCopy,
        beforeId
      ) {
        if (!entity) {
          entity = yield quest.me.getEntity({entityId, privateState: true});
        } else {
          entity = new Goblin.Shredder(entity);
        }
        const id = yield quest.me.addCopyRef({
          path,
          type,
          entityId: entityId || entity.get('id'),
          entity,
          deepCopy: deepCopy !== undefined ? deepCopy : true,
          beforeId,
        });
        return id;
      };

      refQuests[`remove-from-${path}`] = function* (quest, entityId) {
        yield quest.me.removeRef({path, entityId});
      };

      refQuests[`move-into-${path}`] = function* (
        quest,
        id,
        entityId,
        beforeEntityId
      ) {
        yield quest.me.moveRef({path, entityId, beforeEntityId});
      };

      refQuests[`clear-${path}`] = function* (quest) {
        let entityIds = quest.goblin.getState().get(path, null);
        if (entityIds) {
          entityIds = entityIds.toArray();
        } else {
          entityIds = [];
        }
        quest.dispatch('clear-ref', {path, value: []});
        quest.evt('<collection-changed>', {
          eventType: 'cleared',
          entityType: type,
          entityIds,
          path,
        });
        yield rehydrate(quest);
      };
    } else {
      //Entity case
      refQuests[`set-${path}`] = function* (quest, entityId) {
        yield quest.me.setRef({path, entityId});
      };
    }
  }
  return refQuests;
};

const buildValuesQuests = (values, rehydrate) => {
  const valQuests = {};
  for (const path in values) {
    const val = values[path];

    if (common.referenceUseArity(val)) {
      const type = common.getReferenceType(val);

      valQuests[`add-new-to-${path}`] = function* (
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

      valQuests[`copy-${path}`] = function* (
        quest,
        entityId,
        entityPath,
        entity,
        deepCopy
      ) {
        if (!entityPath) {
          entityPath = path;
        }
        if (!entity) {
          entity = yield quest.me.getEntity({entityId, privateState: true});
        } else {
          entity = new Goblin.Shredder(entity);
        }
        const entityIds = entity.get(entityPath).toArray();
        if (entityIds.length === 0) {
          return;
        }
        let entities = entity.get(`private.${entityPath}`);
        if (!entities) {
          const fetchedEntities = yield quest.me.getEntities({type, entityIds});
          entities = fetchedEntities.reduce((state, entity) => {
            return state.set(entity.id, entity);
          }, Goblin.Shredder.fromJS({}));
        }
        yield quest.me.copyCollectionByValue({
          path,
          entityIds,
          entities,
          deepCopy: deepCopy !== undefined ? deepCopy : true,
        });
      };

      valQuests[`add-copy-${path}`] = function* (
        quest,
        entityId,
        entity,
        deepCopy,
        beforeId
      ) {
        if (!entity) {
          entity = yield quest.me.getEntity({entityId, privateState: true});
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
        });
        return id;
      };

      valQuests[`add-to-${path}`] = function* (
        quest,
        entityId,
        entity,
        beforeId
      ) {
        if (entity) {
          entity = new Goblin.Shredder(entity);
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
          const entity = yield quest.me.getEntity({
            entityId,
            privateState: true,
          });
          yield quest.me.addVal({path, entity, beforeId});
        }
      };

      valQuests[`remove-from-${path}`] = function* (quest, entityId, entity) {
        if (!entityId) {
          if (entity) {
            entity = new Goblin.Shredder(entity);
            entityId = entity.get('id');
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
        yield quest.me.removeVal({path, entityId});
      };

      valQuests[`move-into-${path}`] = function* (
        quest,
        id,
        entityId,
        beforeEntityId
      ) {
        yield quest.me.moveVal({path, entityId, beforeEntityId});
      };

      valQuests[`clear-${path}`] = function* (quest) {
        const entityIds = yield quest.me.clearVal({path});
        quest.evt('<collection-changed>', {
          eventType: 'cleared',
          entityType: type,
          entityIds,
          path,
        });
        yield rehydrate(quest);
      };
    } else {
      //Entity case
      const type = common.getReferenceType(val);
      valQuests[`set-${path}`] = function* (quest, entityId, entity) {
        if (entity) {
          entity = new Goblin.Shredder(entity);
          yield quest.me.setVal({path, entity});
        } else {
          if (!entityId) {
            return;
          }
          const entity = yield quest.me.getEntity({
            entityId,
            privateState: true,
          });
          yield quest.me.setVal({path, entity});
        }
      };

      valQuests[`set-new-${path}`] = function* (quest, payload, parentEntity) {
        if (!parentEntity) {
          parentEntity = quest.goblin.id;
        }
        const id = yield quest.me.setNewVal({
          path,
          type,
          payload,
          parentEntity,
        });
        return id;
      };
    }
  }
  return valQuests;
};

module.exports = {
  buildReferencesQuests,
  buildValuesQuests,
};
