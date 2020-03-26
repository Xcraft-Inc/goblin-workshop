const {configurations} = require('../entity-builder.js');
const {converters} = require('xcraft-core-converters');
const common = require('../workitems/common.js');
const Bool = require('goblin-gadgets/widgets/helpers/bool-helpers');
const Converters = converters;

/******************************************************************************/

function report(reporter, params) {
  if (reporter) {
    reporter(params);
  } else {
    console.warn('No reporter!');
  }
}

function isNotNull(value) {
  return value !== null;
}

/******************************************************************************/

function checkType(reporter, entityId, prop, conf, value, entityFixPatch) {
  const path = prop;
  const pathType = conf.type;

  switch (pathType) {
    case 'entityId':
      if (isNotNull(value) && typeof value !== 'string') {
        report(reporter, {
          topic: 'bad-value',
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          message: 'Bad value',
        });
        entityFixPatch[prop] = null;
      } else if (
        isNotNull(value) &&
        typeof value === 'string' &&
        value.indexOf('@') === -1
      ) {
        report(reporter, {
          topic: 'bad-id',
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          message: 'Bad entityId',
        });
        entityFixPatch[prop] = null;
      }
      break;
    case 'string':
      if (isNotNull(value) && typeof value !== 'string') {
        report(reporter, {
          topic: 'bad-value',
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          message: 'Bad value',
        });
        entityFixPatch[prop] = value.toString();
      }
      break;
    case 'bool':
      if (value === null) {
        report(reporter, {
          topic: 'boolean-string',
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          message: 'Null boolean detected',
        });
        entityFixPatch[prop] = conf.defaultValue;
      } else if (typeof value === 'string') {
        // For historical reason, bool fields can contains string "false" or "true"!
        if (value === 'false' || value === 'true') {
          report(reporter, {
            topic: 'boolean-string',
            entityId,
            path,
            pathType,
            value,
            valueType: typeof value,
            message:
              'String boolean detected (temporarily accepted for historical reasons)',
          });
          entityFixPatch[prop] = Bool.isTrue(value);
        } else {
          report(reporter, {
            topic: 'boolean-string',
            entityId,
            path,
            pathType,
            value,
            valueType: typeof value,
            message: 'Bad string boolean detected',
          });
          entityFixPatch[prop] = conf.defaultValue;
        }
      } else if (typeof value !== 'boolean') {
        report(reporter, {
          topic: 'bad-value',
          entityId,
          path,
          pathType,
          value,
          message: 'Bad value',
        });
        entityFixPatch[prop] = conf.defaultValue;
      }
      break;
    case 'array':
      if (isNotNull(value) && !Array.isArray(value)) {
        report(reporter, {
          topic: 'bad-value',
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          message: 'Bad value',
        });
        entityFixPatch[prop] = [];
      }
      break;
    case 'object':
      if (isNotNull(value) && typeof value !== 'object') {
        report(reporter, {
          topic: 'bad-value',
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          message: 'Bad value',
        });
        entityFixPatch[prop] = null;
      }
      break;
    case 'enum':
      if (!conf.values.includes(value)) {
        report(reporter, {
          topic: 'bad-enum-value',
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          message: 'Bad enum value',
        });
        entityFixPatch[prop] = conf.defaultValue;
      }
      break;
    default:
      {
        const converter = Converters.getConverter(pathType);
        if (!converter) {
          report(reporter, {
            topic: 'fatal',
            entityId,
            path,
            pathType,
            value,
            valueType: typeof value,
            message: 'Converter not found',
          });
        } else if (
          isNotNull(value) &&
          value !== '' &&
          !converter.check(value)
        ) {
          report(reporter, {
            topic: 'bad-value',
            entityId,
            path,
            pathType,
            value,
            valueType: typeof value,
            message: 'Bad value',
          });
          entityFixPatch[prop] = conf.defaultValue;
        }
      }
      break;
  }
}

/******************************************************************************/

function checkPointers(
  configuration,
  mode, // references/values
  entity,
  reporter,
  pointerToRemove
) {
  if (!configuration[mode]) {
    return;
  }
  for (const [prop, info] of Object.entries(configuration[mode])) {
    const type = common.getReferenceType(info);
    const isCollection = common.referenceUseArity(info);
    if (isCollection) {
      const collection = entity[prop];
      if (!collection || !Array.isArray(collection)) {
        report(reporter, {
          topic: `missing-pointer-${mode}`,
          entityId: entity.id,
          path: prop,
          pathType: '',
          value: null,
          valueType: null,
          message: 'Missing collection',
        });
        continue;
      }
      for (const id of collection) {
        if (id.indexOf('@') === -1) {
          report(reporter, {
            topic: `bad-pointer-${mode}`,
            entityId: entity.id,
            path: prop,
            pathType: '',
            value: id,
            valueType: null,
            message: 'Strange id',
          });
          pointerToRemove.push(prop);
          continue;
        }
        const existingType = id.split('@')[0];
        if (existingType !== type) {
          report(reporter, {
            topic: `bad-pointer-${mode}`,
            entityId: entity.id,
            path: prop,
            pathType: type,
            value: id,
            valueType: existingType,
            message: 'Entity pointed by id has a bad type',
          });
          pointerToRemove.push(prop);
          continue;
        }
      }
    } else {
      const reference = entity[prop];
      if (reference) {
        if (reference.indexOf('@') === -1) {
          report(reporter, {
            topic: `bad-pointer-${mode}`,
            entityId: entity.id,
            path: prop,
            pathType: '',
            value: reference,
            valueType: typeof value,
            message: 'Strange id',
          });
          pointerToRemove.push(prop);
          continue;
        }
        const existingType = reference.split('@')[0];
        if (existingType !== type) {
          report(reporter, {
            topic: `bad-pointer-${mode}`,
            entityId: entity.id,
            path: prop,
            pathType: type,
            value: reference,
            valueType: existingType,
            message: 'Entity pointed by id has a bad type',
          });
          pointerToRemove.push(prop);
          continue;
        }
      }
    }
  }
}

/******************************************************************************/

// Function to check entity (add missing properties to an entity and clear unused properties).
// reporter: Function to log warnings/errors
module.exports = function(entity, reporter) {
  const entityFixPatch = {};
  const propsToRemove = [];
  const pointerToRemove = [];
  let needRehydrating = false;

  if (!entity) {
    report(reporter, {
      topic: 'fatal',
      entityId: 'undefined',
      path: '',
      pathType: '',
      value: null,
      valueType: null,
      message: 'No entity to check',
    });
    return null;
  }

  const type = entity.id.split('@')[0];
  const configuration = configurations[type];

  /******************** Warnings for bad references/values *************************/

  checkPointers(configuration, 'values', entity, reporter, pointerToRemove);
  checkPointers(configuration, 'references', entity, reporter, pointerToRemove);

  /******************** Warnings for missing keys *************************/

  if (configuration.properties) {
    for (const [prop, conf] of Object.entries(configuration.properties)) {
      if (!entity.hasOwnProperty(prop)) {
        report(reporter, {
          topic: 'missing-in-entity',
          entityId: entity.id,
          path: prop,
          pathType: '',
          value: null,
          valueType: null,
          message: 'Missing root key/value',
        });
        entityFixPatch[prop] = conf.defaultValue;
      } else {
        checkType(
          reporter,
          entity.id,
          prop,
          conf,
          entity[prop],
          entityFixPatch
        );
      }
    }
  }

  if (configuration.summaries) {
    for (const [prop, conf] of Object.entries(configuration.summaries)) {
      if (!entity['meta']) {
        report(reporter, {
          topic: 'missing-meta',
          entityId: entity.id,
          path: 'meta',
          pathType: '',
          value: null,
          valueType: null,
          message: 'Missing metadata',
        });
        needRehydrating = true;
        continue;
      }
      if (!entity['meta']['summaries']) {
        report(reporter, {
          topic: 'missing-summaries',
          entityId: entity.id,
          path: 'meta.summaries',
          pathType: '',
          value: null,
          valueType: null,
          message: 'Missing summaries',
        });
        needRehydrating = true;
        continue;
      }
      if (!entity['meta']['summaries'].hasOwnProperty(prop)) {
        report(reporter, {
          topic: 'missing-in-entity',
          entityId: entity.id,
          path: `meta.summaries.${prop}`,
          pathType: '',
          value: null,
          valueType: null,
          message: 'Missing summary key/value',
        });
        needRehydrating = true;
        continue;
      }
    }
  }

  if (configuration.sums) {
    for (const [prop, conf] of Object.entries(configuration.sums)) {
      if (!entity['sums']) {
        report(reporter, {
          topic: 'missing-sums',
          entityId: entity.id,
          path: 'sums',
          pathType: '',
          value: null,
          valueType: null,
          message: 'Missing sums',
        });
        needRehydrating = true;
        continue;
      }
      if (!entity['sums'].hasOwnProperty(prop)) {
        report(reporter, {
          topic: 'missing-in-entity',
          entityId: entity.id,
          path: `sums.${prop}`,
          pathType: '',
          value: null,
          valueType: null,
          message: 'Missing sums key/value',
        });
        needRehydrating = true;
        continue;
      }
    }
  }

  /****************** Warnings for keys not in schema **********************/

  for (const prop of Object.keys(entity)) {
    // Exclude some keys to be checked.
    if (['meta', 'sums', 'id', 'private'].includes(prop)) {
      continue;
    }

    // Exclude values.
    if (
      configuration.values &&
      Object.keys(configuration.values).includes(prop)
    ) {
      continue;
    }

    // Exclude references.
    if (
      configuration.references &&
      Object.keys(configuration.references).includes(prop)
    ) {
      continue;
    }

    // If a prop is undefined, show warning.
    if (configuration.properties[prop] === undefined) {
      const value = entity[prop];
      report(reporter, {
        topic: 'missing-in-properties-schema',
        entityId: entity.id,
        path: prop,
        pathType: '',
        value,
        valueType: typeof value,
        message: 'Property is not described in schema',
      });
      propsToRemove.push(prop);
    }
  }

  if (entity.meta.summaries) {
    for (const prop of Object.keys(entity.meta.summaries)) {
      if (configuration['summaries'][prop] === undefined) {
        report(reporter, {
          topic: 'missing-in-summaries-schema',
          entityId: entity.id,
          path: `summaries.${prop}`,
          pathType: '',
          value: null,
          valueType: null,
          message: 'Summary is not described in schema',
        });
        propsToRemove.push(`meta.summaries.${prop}`);
      }
    }
  }

  if (entity.sums && configuration.sums) {
    for (const prop of Object.keys(entity.sums)) {
      if (configuration['sums'][prop] === undefined) {
        report(reporter, {
          topic: 'missing-in-sums-schema',
          entityId: entity.id,
          path: `sums.${prop}`,
          pathType: '',
          value: null,
          valueType: null,
          message: 'Sums is not described in schema',
        });
        propsToRemove.push(`sums.${prop}`);
      }
    }
  }

  return {
    entityId: entity.id,
    rootAggregateId: entity.meta.rootAggregateId,
    rootAggregatePath: entity.meta.rootAggregatePath,
    entityFixPatch,
    propsToRemove,
    pointerToRemove,
    needRehydrating,
  };
};

/******************************************************************************/
