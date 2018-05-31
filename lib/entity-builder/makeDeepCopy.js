const Shredder = require('xcraft-core-shredder');
const uuidV4 = require('uuid/v4');

const changePrivate = (
  entities,
  idsMap,
  rootAggregateId,
  rootAggregatePathSuffix,
  persist
) => {
  if (!entities) {
    return new Shredder({});
  }
  entities = entities.mapKeys(oldId => idsMap[oldId]);
  entities = entities.reduce((entities, entity, newId) => {
    const newEntity = changeEntity(
      new Shredder(entity),
      newId,
      rootAggregateId,
      rootAggregatePathSuffix.concat([newId]),
      persist
    );
    entities = entities.set(newId, newEntity);
    return entities;
  }, new Shredder({}));
  return entities;
};

const changeEntity = (
  entity,
  newId,
  rootAggregateId,
  rootAggregatePath,
  persist
) => {
  if (newId) {
    entity = entity.set('id', newId);
    entity = entity.set('meta.id', newId);
  }
  if (rootAggregateId) {
    entity = entity.set('meta.rootAggregateId', rootAggregateId);
  } else {
    rootAggregateId = entity.get('id');
  }
  if (rootAggregatePath) {
    entity = entity.set('meta.rootAggregatePath', rootAggregatePath);
  } else {
    rootAggregatePath = [];
  }
  const values = entity.get('meta.values', null);
  if (values) {
    let idsMap = {};
    for (const path of values.keys()) {
      const newIds = [];
      idsMap = entity.get(path).reduce((state, id) => {
        const type = id.split('@')[0];
        const newId = `${type}@${uuidV4()}`;
        newIds.push(newId);
        state[id] = newId;
        return state;
      }, {});
      entity = entity.set(path, newIds);
      entity = entity.set(
        `private.${path}`,
        changePrivate(
          entity.get(`private.${path}`, null),
          idsMap,
          rootAggregateId,
          rootAggregatePath.concat(['private', path]),
          persist
        ).toJS()
      );
    }
  }
  persist(entity);
  return entity;
};

module.exports = (entity, newId, rootAggregateId, rootAggregatePath, persist) =>
  changeEntity(
    new Shredder(entity),
    newId,
    rootAggregateId,
    rootAggregatePath,
    persist
  );
