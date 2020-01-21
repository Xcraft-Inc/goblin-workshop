const normalizeEntity = require('./normalizeEntity.js');

// migrate a collection of entities to a new type of entity

module.exports = function migrateCollectionFT2T(
  entity,
  oldCollectionProp, // old name "string"
  newCollectionProp, // new name "string"
  newCollectionType, // new type of entity "string"
  entityTransformer // function who transform entity
) {
  const migrateId = oldId => `${newCollectionType}@${oldId.split('@')[1]}`;
  console.log(`migrating ${oldCollectionProp} -> ${newCollectionProp}`);
  entity.private[newCollectionProp] = Object.values(
    entity.private[oldCollectionProp]
  ).reduce((newCollection, oldEntity) => {
    const newId = migrateId(oldEntity.id);
    entityTransformer(entity, oldEntity, newId).map(newEntity => {
      normalizeEntity(newEntity, entity, newCollectionProp);
      newCollection[newEntity.id] = newEntity;
      console.log(`private.${newCollectionProp}.${newEntity.id}`);
    });
    return newCollection;
  }, {});
  entity[newCollectionProp] = Object.keys(entity.private[newCollectionProp]);
  console.log(`${newCollectionProp}: [${entity[newCollectionProp].join(',')}]`);
  delete entity.private[oldCollectionProp];
  delete entity[oldCollectionProp];
  return Object.values(entity.private[newCollectionProp]);
};
