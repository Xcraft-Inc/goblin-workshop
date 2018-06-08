const Shredder = require('xcraft-core-shredder');
const uuidV4 = require('uuid/v4');
const entityMeta = require('../entity-meta');

const changePrivate = (
  entities,
  idsMap,
  rootAggregateId,
  rootAggregatePathSuffix,
  parentEntity,
  status,
  persist
) => {
  if (!entities || entities.size === 0) {
    return new Shredder({});
  }
  entities = entities.mapKeys(oldId => {
    const newId = idsMap[oldId];
    if (!newId) {
      return '_missing_';
    } else {
      return newId;
    }
  });
  entities = entities.reduce((entities, entity, newId) => {
    if (newId !== '_missing_') {
      const newEntity = changeEntity(
        new Shredder(entity),
        newId,
        status,
        rootAggregateId,
        rootAggregatePathSuffix.concat([newId]),
        parentEntity,
        persist
      );
      entities = entities.set(newId, newEntity);
    }
    return entities;
  }, new Shredder({}));
  return entities;
};

const changeEntity = (
  entity,
  newId,
  status,
  rootAggregateId,
  rootAggregatePath,
  parentEntity,
  persist
) => {
  if (newId) {
    entity = entity.set('id', newId);
  }
  if (!rootAggregateId) {
    rootAggregateId = entity.get('id');
  }
  if (!rootAggregatePath) {
    rootAggregatePath = [];
  }
  if (!parentEntity) {
    parentEntity = null;
  }
  const type = entity.get('id').split('@')[0];
  //backup references
  const references = entity.get('meta.references', null);
  //backup values
  const values = entity.get('meta.values', null);
  //backup summaries
  const summaries = entity.get('meta.summaries').toJS();
  //reset meta-data
  entity = entity.del('meta');

  //change and restore some meta-data
  entity = entityMeta.set(
    entity,
    type,
    references ? references.toJS() : null,
    values ? values.toJS() : null,
    parentEntity,
    rootAggregateId,
    rootAggregatePath,
    status
  );

  // Restore summaries
  entity = entity.set('meta.summaries', summaries);

  if (values) {
    let idsMap = {};
    for (const path of values.keys()) {
      const newIds = [];
      // gater new ids mapping
      idsMap = entity.get(path, []).reduce((state, id) => {
        if (entity.has(`private.${path}.${id}`)) {
          const type = id.split('@')[0];
          const newId = `${type}@${uuidV4()}`;
          newIds.push(newId);
          state[id] = newId;
        }
        return state;
      }, {});

      entity = entity.set(path, newIds);

      if (newIds.length > 0) {
        entity = entity.set(
          `private.${path}`,
          changePrivate(
            entity.get(`private.${path}`, null),
            idsMap,
            rootAggregateId,
            rootAggregatePath.concat(['private', path]),
            newId,
            status,
            persist
          ).toJS()
        );
      } else {
        entity = entity.set(`private.${path}`, {});
      }
    }
  }
  setImmediate(persist, entity);
  return entity;
};

module.exports = (
  entity,
  newId,
  status,
  rootAggregateId,
  rootAggregatePath,
  parentEntity,
  persist
) =>
  changeEntity(
    new Shredder(entity),
    newId,
    status,
    rootAggregateId,
    rootAggregatePath,
    parentEntity,
    persist
  );