const {configurations} = require('../entity-builder.js');
const {converters} = require('xcraft-core-converters');
const Converters = converters;

/******************************************************************************/

function report(reporter, params) {
  if (reporter) {
    const valueType = params.value === null ? '' : typeof params.value;
    reporter({
      topic: params.topic,
      entityId: params.entityId,
      path: params.path,
      pathType: params.pathType,
      value: params.value,
      valueType,
      message: params.message,
    });
  } else {
    console.warn('No reporter!');
  }
}

function isNotNull(value) {
  return value !== null;
}

function checkType(reporter, entityId, prop, conf, value) {
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
          message: 'Bad value',
        });
      }
      if (
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
          message: 'Bad entityId',
        });
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
          message: 'Bad value',
        });
      }
      break;
    case 'bool':
      if (isNotNull(value) && typeof value === 'string') {
        // For historical reason, bool fields must contains string "false" or "true"!
        if (value === 'false' || value === 'true') {
          report(reporter, {
            topic: 'boolean-string',
            entityId,
            path,
            pathType,
            value,
            message: 'String boolean detected',
          });
        } else {
          report(reporter, {
            topic: 'boolean-string',
            entityId,
            path,
            pathType,
            value,
            message: 'Bad string boolean detected',
          });
        }
      } else if (isNotNull(value) && typeof value !== 'boolean') {
        report(reporter, {
          topic: 'bad-value',
          entityId,
          path,
          pathType,
          value,
          message: 'Bad value',
        });
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
          message: 'Bad value',
        });
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
          message: 'Bad value',
        });
      }
      break;
    case 'enum':
      if (!conf.values.includes(value)) {
        report(reporter, {
          topic: 'bad-emun-value',
          entityId,
          path,
          pathType,
          value,
          message: 'Bad enum value',
        });
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
            message: 'Converter not found',
          });
        } else if (isNotNull(value) && !converter.check(value)) {
          report(reporter, {
            topic: 'bad-value',
            entityId,
            path,
            pathType,
            value,
            message: 'Bad value',
          });
        }
      }
      break;
  }
}

/******************************************************************************/

// Function to check entity (add missing properties to an entity and clear unused properties)
// reporter = Function to log warnings/errors
// correct = Add missing keys/values in entity with default value
// deleteMissingKeys = Remove keys not present in schema from entity
module.exports = function(
  entity,
  reporter,
  setDefaultKeyValue = false,
  deleteMissingKeys = false
) {
  if (!entity) {
    report(reporter, {
      topic: 'fatal',
      entityId: 'undefined',
      path: '',
      pathType: '',
      value: null,
      message: 'No entity to check',
    });
    return;
  }

  const type = entity.id.split('@')[0];
  const configuration = configurations[type];

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
          message: 'Missing root key/value',
        });
        if (setDefaultKeyValue) {
          entity[prop] = conf.defaultValue;
        }
      } else {
        checkType(reporter, entity.id, prop, conf, entity[prop]);
        // Do something if correct mode activated ?
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
          message: 'Missing metadata',
        });
        continue;
      }
      if (!entity['meta']['summaries']) {
        report(reporter, {
          topic: 'missing-summaries',
          entityId: entity.id,
          path: 'meta.summaries',
          pathType: '',
          value: null,
          message: 'Missing summaries',
        });
        continue;
      }
      if (!entity['meta']['summaries'][prop]) {
        report(reporter, {
          topic: 'missing-in-entity',
          entityId: entity.id,
          path: `meta.summaries.${prop}`,
          pathType: '',
          value: null,
          message: 'Missing summary key/value',
        });
        if (setDefaultKeyValue) {
          entity['meta']['summaries'][prop] = conf.defaultValue;
        }
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
          message: 'Missing sums',
        });
        continue;
      }
      if (!entity['sums'][prop]) {
        report(reporter, {
          topic: 'missing-in-entity',
          entityId: entity.id,
          path: `sums.${prop}`,
          pathType: '',
          value: null,
          message: 'Missing sums key/value',
        });
        if (setDefaultKeyValue) {
          entity['sums'][prop] = conf.defaultValue;
        }
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
        message: 'Property is not described in schema',
      });
      if (deleteMissingKeys) {
        delete entity[prop];
      }
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
          message: 'Summary is not described in schema',
        });
        if (deleteMissingKeys) {
          delete entity['meta']['summaries'][prop];
        }
      }
    }
  }

  if (entity.sums) {
    for (const prop of Object.keys(entity.sums)) {
      if (configuration['sums'][prop] === undefined) {
        report(reporter, {
          topic: 'missing-in-sums-schema',
          entityId: entity.id,
          path: `sums.${prop}`,
          pathType: '',
          value: null,
          message: 'Sums is not described in schema',
        });
        if (deleteMissingKeys) {
          delete entity['sums'][prop];
        }
      }
    }
  }
};

/******************************************************************************/
