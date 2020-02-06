const {configurations} = require('../entity-builder.js');
const {converters} = require('xcraft-core-converters');
const Converters = converters;

/******************************************************************************/

function writeLine(reporter, topic, entityId, path, message) {
  if (reporter) {
    reporter(topic, entityId, path, message);
  } else {
    console.warn(`${topic}: ${message}`);
  }
}

function checkBasis(reporter, entityId, prop, conf, value) {
  const topic = 'bad-value';
  const path = prop;
  const message = `Bad value (type='${conf.type}' value='${value}')`;
  switch (conf.type) {
    case 'string':
      if (typeof value !== 'string') {
        writeLine(reporter, topic, entityId, path, message);
      }
      break;
    case 'bool':
      if (typeof value === 'string') {
        // For historical reason, bool fields must contains string "false" or "true"!
        if (value === 'false' || value === 'true') {
          writeLine(reporter, 'warning', entityId, path, message);
        } else {
          writeLine(reporter, topic, entityId, path, message);
        }
      } else if (typeof value !== 'boolean') {
        writeLine(reporter, 'warning', entityId, path, message);
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        writeLine(reporter, topic, entityId, path, message);
      }
      break;
    case 'object':
      if (typeof value !== 'object') {
        writeLine(reporter, topic, entityId, path, message);
      }
      break;
    case 'enum':
      if (!conf.values.includes(value)) {
        writeLine(reporter, topic, entityId, path, message);
      }
      break;
    default:
      {
        const converter = Converters.getConverter(conf.type);
        if (!converter) {
          writeLine(
            reporter,
            'fatal',
            entityId,
            path,
            `${entityId}[${prop}] (${conf.type}) Converter not found`
          );
        } else if (!converter.check(value)) {
          writeLine(reporter, topic, entityId, path, message);
        }
      }
      break;
  }
}

/******************************************************************************/

// Normalize metadata, clear unused properties and add missing properties to an entity.
module.exports = function(entity, reporter, correct = false) {
  if (!entity) {
    writeLine(reporter, 'fatal', 'undefined', '', 'No entity to check...');
    return;
  }

  const type = entity.id.split('@')[0];
  const configuration = configurations[type];

  /******************** Warnings for missing keys *************************/

  if (configuration.properties) {
    for (const [prop, conf] of Object.entries(configuration.properties)) {
      const value = entity[prop];
      if (!value) {
        writeLine(
          reporter,
          'missing-in-entity',
          entity.id,
          prop,
          `${entity.id}[${prop}] Missing root key/value`
        );
        if (correct) {
          entity[prop] = conf.defaultValue;
        }
      } else {
        checkBasis(reporter, entity.id, prop, conf, value);
        // Do something if correct mode activated ?
      }
    }
  }

  if (configuration.summaries) {
    for (const [prop, conf] of Object.entries(configuration.summaries)) {
      if (!entity['meta']['summaries'][prop]) {
        writeLine(
          reporter,
          'missing-in-entity',
          entity.id,
          `meta.summaries.${prop}`,
          `${entity.id}[meta][summaries][${prop}] Missing summary key/value`
        );
        if (correct) {
          entity['meta']['summaries'][prop] = conf.defaultValue;
        }
      }
    }
  }

  if (configuration.sums) {
    for (const [prop, conf] of Object.entries(configuration.sums)) {
      if (!entity['sums'][prop]) {
        writeLine(
          reporter,
          'missing-in-entity',
          entity.id,
          `sums.${prop}`,
          `${entity.id}[sums][${prop}] Missing sums key/value`
        );
        if (correct) {
          entity['sums'][prop] = conf.defaultValue;
        }
      }
    }
  }

  /****************** Warnings for keys not in schema **********************/

  for (const prop of Object.keys(entity)) {
    // Exclude some keys to be checked.
    if (['meta', 'sums', 'id'].includes(prop)) {
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
    if (configuration === undefined) {
      writeLine(
        reporter,
        'missing-in-schema',
        entity.id,
        prop,
        `${entity.id}[${prop}] Key and value not in schema`
      );
    }
  }

  if (entity.meta.summaries) {
    for (const prop of Object.keys(entity.meta.summaries)) {
      if (!configuration['summaries'][prop]) {
        writeLine(
          reporter,
          'missing-in-schema',
          entity.id,
          `summaries.${prop}`,
          `${entity.id}[meta][summaries][${prop}] Key and value not in schema`
        );
      }
    }
  }

  if (entity.sums) {
    for (const prop of Object.keys(entity.sums)) {
      if (!configuration['sums'][prop]) {
        writeLine(
          reporter,
          'missing-in-schema',
          entity.id,
          `sums.${prop}`,
          `${entity.id}[sums][${prop}] Key and value not in schema`
        );
      }
    }
  }
};

/******************************************************************************/
