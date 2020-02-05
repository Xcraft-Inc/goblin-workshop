const {configurations} = require('../entity-builder.js');
const merge = require('lodash/merge');

// Normalize metadata, clear unused properties and add missing properties to an entity

module.exports = function(entity, parent, collection) {
  if (!entity) {
    console.log('No entity to normalize...');
    return [];
  }
  const meta = entity.meta;
  const type = entity.id.split('@')[0];
  const conf = configurations[type];
  const normalizedEntity = {private: {}};

  meta.version = entity.meta.version || 1;
  meta.id = entity.id;
  meta.type = type;
  meta.references = conf.references || {};
  meta.values = conf.values || {};

  if (!parent) {
    meta.parentEntity = null;
    meta.rootAggregateId = entity.id;
    meta.rootAggregatePath = [];
  } else {
    meta.parentEntity = parent.id;
    meta.rootAggregateId = parent.meta.rootAggregateId;
    meta.rootAggregatePath = parent.meta.rootAggregatePath.concat([
      'private',
      collection,
      entity.id,
    ]);
  }
  if (configurations[type].properties) {
    for (const [prop, conf] of Object.entries(
      configurations[type].properties
    )) {
      normalizedEntity[prop] = conf.defaultValue || '';
    }
  }
  if (configurations[type].references) {
    for (const prop of Object.keys(configurations[type].references)) {
      normalizedEntity[prop] = entity[prop];
      if (entity.private[prop]) {
        normalizedEntity.private[prop] = entity.private[prop];
      }
    }
  }
  if (configurations[type].values) {
    for (const prop of Object.keys(configurations[type].values)) {
      normalizedEntity[prop] = entity[prop];
      if (entity.private[prop]) {
        normalizedEntity.private[prop] = entity.private[prop];
      }
    }
  }

  if (configurations[type].summaries) {
    for (const prop of Object.keys(configurations[type].summaries)) {
      normalizedEntity[prop] = entity[prop];
      if (entity.private[prop]) {
        normalizedEntity.private[prop] = entity.private[prop];
      }
    }
  }

  if (configurations[type].sums) {
    for (const prop of Object.keys(configurations[type].sums)) {
      normalizedEntity[prop] = entity[prop];
      if (entity.private[prop]) {
        normalizedEntity.private[prop] = entity.private[prop];
      }
    }
  }

  // Delete old content of entity.private
  delete entity.private;

  for (const prop of Object.keys(entity)) {
    // Exclude some keys to be deleted
    if (['meta', 'sums', 'id'].includes(prop)) {
      continue;
    }
    // If a prop is undefined, delete it
    if (normalizedEntity[prop] === undefined) {
      console.warn(`${type} prop deleted : ${prop} -> ${entity[prop]}`);
      delete entity[prop];
    }
  }
  merge(normalizedEntity, entity);
  return normalizedEntity;
};
