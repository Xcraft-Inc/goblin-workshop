const Shredder = require('xcraft-core-shredder');
const {v4: uuidV4} = require('uuid');
const entityMeta = require('../entity-meta.js');
const watt = require('gigawatts');

const changePrivate = watt(function* (
  persist,
  entities,
  idsMap,
  rootAggregateId,
  rootAggregatePathSuffix,
  parentEntity,
  status,
  next
) {
  if (!entities || entities.size === 0) {
    return new Shredder({});
  }
  entities = entities.mapKeys((oldId) => {
    const newId = idsMap[oldId];
    if (!newId) {
      return '_missing_';
    } else {
      return newId;
    }
  });

  let newEntities = new Shredder({});
  for (const [newId, entity] of entities.entries()) {
    if (newId !== '_missing_') {
      const newEntity = yield changeEntity(
        persist,
        entity,
        newId,
        status,
        rootAggregateId,
        rootAggregatePathSuffix.concat([newId]),
        parentEntity
      );
      newEntities = newEntities.set(newId, newEntity);
    }
  }

  return newEntities;
});

const changeEntity = watt(function* (
  persist,
  entity,
  newId,
  status,
  rootAggregateId,
  rootAggregatePath,
  parentEntity,
  next
) {
  entity = new Shredder(entity);
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
  const type = entity.get('id').split('@', 1)[0];
  //backup references
  const references = entity.get('meta.references', null);
  //backup values
  const values = entity.get('meta.values', null);
  //backup links
  const links = entity.get('meta.links', null);
  //backup summaries
  const summaries = entity.get('meta.summaries', null);
  //backup views
  const views = entity.get('meta.views', null);
  //backup index
  const index = entity.get('meta.index', null);
  //backup alerts and alerts flags
  const alerts = entity.get('meta.alerts', null);
  const hasErrors = entity.get('meta.hasErrors', false);
  const hasWarnings = entity.get('meta.hasWarnings', false);

  //reset meta-data
  entity = entity.del('meta');

  //change and restore some meta-data
  entity = entityMeta.set(
    entity,
    type,
    references ? references.toJS() : null,
    values ? values.toJS() : null,
    links ? links.toJS() : null,
    parentEntity,
    rootAggregateId,
    rootAggregatePath,
    status
  );

  // Restore meta's
  if (summaries) {
    entity = entity.set('meta.summaries', summaries.toJS());
  }
  if (views) {
    entity = entity.set('meta.views', views.toJS());
  }
  if (index) {
    entity = entity.set('meta.index', index.toJS());
  }
  if (alerts) {
    entity = entity.set('meta.alerts', alerts.toJS());
    entity = entity.set('meta.hasErrors', hasErrors);
    entity = entity.set('meta.hasWarnings', hasWarnings);
  }

  if (values) {
    for (const path of values.keys()) {
      let idsMap = {};
      const newIds = [];
      const target = entity.get(path);
      if (!target) {
        continue;
      }
      const configs = require('../entity-builder.js').configurations;
      if (Shredder.isList(target)) {
        // handle collection
        // gater new ids mapping
        idsMap = target.reduce((state, id) => {
          if (entity.has(`private.${path}.${id}`)) {
            const type = id.split('@', 1)[0];
            if (configs[type].preventCopyFlagProperty) {
              const preventCopyPath = `private.${path}.${id}.${configs[type].preventCopyFlagProperty}`;
              if (entity.get(preventCopyPath, false)) {
                return state;
              }
            }
            const newId = `${type}@${uuidV4()}`;
            newIds.push(newId);
            state[id] = newId;
          }
          return state;
        }, {});

        entity = entity.set(path, newIds);
      } else {
        // handle single value
        const type = target.split('@', 1)[0];
        const newId = `${type}@${uuidV4()}`;
        newIds.push(newId);
        idsMap = {[target]: newId};
        entity = entity.set(path, newId);
      }

      if (newIds.length > 0) {
        const privateEntities = yield changePrivate(
          persist,
          entity.get(`private.${path}`, null),
          idsMap,
          rootAggregateId,
          rootAggregatePath.concat(['private', path]),
          newId,
          status
        );
        entity = entity.set(`private.${path}`, privateEntities);
      } else {
        entity = entity.set(`private.${path}`, {});
      }
    }
  }
  yield persist(entity);
  return entity;
});

module.exports = changeEntity;
