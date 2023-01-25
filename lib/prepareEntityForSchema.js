function prepareEntityForSchema(entity) {
  const {configurations} = require('./entity-builder.js');
  if (entity.toJS) {
    entity = entity.toJS();
  }
  const config = configurations[entity.meta.type];
  const preparedEntity = {
    id: entity.id,
    ...Object.keys(config.references ? config.references : {}).reduce(
      (references, prop) => {
        references[prop] = entity[prop];
        return references;
      },
      {}
    ),
    ...Object.keys(config.properties ? config.properties : {}).reduce(
      (properties, prop) => {
        properties[prop] = entity[prop];
        return properties;
      },
      {}
    ),
    ...Object.keys(config.values ? config.values : {}).reduce(
      (values, prop) => {
        if (!entity.private || !entity.private[prop]) {
          values[prop] = [];
          return values;
        }
        values[prop] = Object.values(entity.private[prop]).map((e) =>
          prepareEntityForSchema(e)
        );
        return values;
      },
      {}
    ),
  };
  return preparedEntity;
}
module.exports = prepareEntityForSchema;
