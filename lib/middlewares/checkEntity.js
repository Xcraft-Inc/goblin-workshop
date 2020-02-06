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
function isNotNull(value) {
  return value !== null;
}

function checkBasis(reporter, entityId, prop, conf, value) {
  const topic = 'bad-value';
  const path = prop;
  let message = fType =>
    `Bad value (expected type='${conf.type}' value='${value}' type='${fType}') `;
  switch (conf.type) {
    case 'entityId':
      if (isNotNull(value) && typeof value !== 'string') {
        writeLine(reporter, topic, entityId, path, message(typeof value));
      }
      if (
        isNotNull(value) &&
        typeof value === 'string' &&
        value.indexOf('@') === -1
      ) {
        message = `Bad entityId value='${value}'`;
        writeLine(reporter, 'bad-id', entityId, path, message);
      }
      break;
    case 'string':
      if (isNotNull(value) && typeof value !== 'string') {
        writeLine(reporter, topic, entityId, path, message(typeof value));
      }
      break;
    case 'bool':
      if (isNotNull(value) && typeof value === 'string') {
        // For historical reason, bool fields must contains string "false" or "true"!
        if (value === 'false' || value === 'true') {
          message = `String boolean detected value='${value}'`;
          writeLine(reporter, 'boolean-string', entityId, path, message);
        } else {
          message = `Bad string boolean detected value='${value}'`;
          writeLine(reporter, 'boolean-string', entityId, path, message);
        }
      } else if (isNotNull(value) && typeof value !== 'boolean') {
        writeLine(reporter, topic, entityId, path, message(typeof value));
      }
      break;
    case 'array':
      if (isNotNull(value) && !Array.isArray(value)) {
        writeLine(reporter, topic, entityId, path, message(typeof value));
      }
      break;
    case 'object':
      if (isNotNull(value) && typeof value !== 'object') {
        writeLine(reporter, topic, entityId, path, message(typeof value));
      }
      break;
    case 'enum':
      if (!conf.values.includes(value)) {
        message = `Bad enum value value='${value}'`;
        writeLine(reporter, 'bad-enum-value', entityId, path, message);
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
            `Converter not found (${conf.type})`
          );
        } else if (isNotNull(value) && !converter.check(value)) {
          writeLine(reporter, topic, entityId, path, message(typeof value));
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
      if (!entity.hasOwnProperty(prop)) {
        writeLine(
          reporter,
          'missing-in-entity',
          entity.id,
          prop,
          `Missing root key/value`
        );
        if (correct) {
          entity[prop] = conf.defaultValue;
        }
      } else {
        checkBasis(reporter, entity.id, prop, conf, entity[prop]);
        // Do something if correct mode activated ?
      }
    }
  }

  if (configuration.summaries) {
    for (const [prop, conf] of Object.entries(configuration.summaries)) {
      if (!entity['meta']) {
        writeLine(
          reporter,
          'missing-meta',
          entity.id,
          `meta`,
          `Missing metadata`
        );
        continue;
      }
      if (!entity['meta']['summaries']) {
        writeLine(
          reporter,
          'missing-summaries',
          entity.id,
          `meta.summaries`,
          `Missing summaries`
        );
        continue;
      }
      if (!entity['meta']['summaries'][prop]) {
        writeLine(
          reporter,
          'missing-in-entity',
          entity.id,
          `meta.summaries.${prop}`,
          `Missing summary key/value`
        );
        if (correct) {
          entity['meta']['summaries'][prop] = conf.defaultValue;
        }
      }
    }
  }

  if (configuration.sums) {
    for (const [prop, conf] of Object.entries(configuration.sums)) {
      if (!entity['sums']) {
        writeLine(reporter, 'missing-sums', entity.id, `sums`, `Missing sums`);
        continue;
      }
      if (!entity['sums'][prop]) {
        writeLine(
          reporter,
          'missing-in-entity',
          entity.id,
          `sums.${prop}`,
          `Missing sums key/value`
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
