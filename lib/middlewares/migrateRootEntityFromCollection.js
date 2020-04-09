const normalizeEntity = require('./normalizeEntity.js');

// Transform collection of entities to root entities without parent

module.exports = function migrateRootEntityFromCollection(
  entity,
  collectionProp,
  newEntityType,
  entityTransformer
) {
  const rootEntities = Object.values(entity.private[collectionProp]).reduce(
    (newEntities, oldEntity) => {
      const newId = `${newEntityType}@${oldEntity.id.split('@')[1]}`;
      const transformed = entityTransformer(
        entity,
        oldEntity,
        newId
      ).map((entity) => normalizeEntity(entity));
      return newEntities.concat(transformed);
    },
    []
  );
  delete entity.private[collectionProp];
  delete entity[collectionProp];
  return rootEntities;
};
