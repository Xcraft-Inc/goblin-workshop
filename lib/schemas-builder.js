//Know issues with swagger:
//https://stackoverflow.com/questions/36866035/how-to-refer-to-enclosing-type-definition-recursively-in-openapi-swagger

module.exports = (options) => {
  const common = require('./workitems/common.js');
  const {configurations} = require('./entity-builder.js');
  const getPrimitiveType = (type) => {
    switch (type) {
      case 'entityId':
      case 'enum':
      case 'date':
      case 'datetime':
      case 'delay':
      case 'length':
      case 'percent':
      case 'price':
      case 'text':
      case 'time':
      case 'volume':
      case 'weight':
        return 'string';
      case 'bool':
        return 'boolean';
      case 'translatable':
        return 'object';
      default:
        return type;
    }
  };
  const buildSchemaFromEntityConfiguration = (config) => {
    if (!config.properties) {
      return {
        $id: `xcraft://goblin-workshop/${config.type}`,
        type: 'object',
        description: config.type,
      };
    }
    return {
      $id: `xcraft://goblin-workshop/${config.type}`,
      type: 'object',
      description: config.type,
      properties: {
        ...Object.keys(config.references ? config.references : {}).reduce(
          (properties, prop) => {
            properties[prop] = {
              type: 'array',
              items: {type: 'string'},
              nullable: true,
            };
            return properties;
          },
          {}
        ),
        ...Object.entries(config.values ? config.values : {}).reduce(
          (properties, [prop, infos]) => {
            const valueType = common.getReferenceType(infos);
            properties[prop] = {
              type: 'array',
              items: {$ref: `xcraft://goblin-workshop/${valueType}`},
              nullable: true,
            };
            return properties;
          },
          {}
        ),
        ...Object.entries(config.properties ? config.properties : {}).reduce(
          (properties, [prop, infos]) => {
            //property skipper:
            if (
              options?.hiddenPropertyTypes &&
              options?.hiddenPropertyTypes.includes(infos.type)
            ) {
              return properties;
            }
            properties[prop] = {
              type: getPrimitiveType(infos.type),
            };
            return properties;
          },
          {}
        ),
      },
    };
  };
  const schemasReducer = (schemas, [type, config]) => {
    schemas[type] = buildSchemaFromEntityConfiguration(config);
    return schemas;
  };
  return Object.entries(configurations).reduce(schemasReducer, {});
};
