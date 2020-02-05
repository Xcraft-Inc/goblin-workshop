const {configurations} = require('../entity-builder.js');
const {converters} = require('xcraft-core-converters');
const Converters = converters;

/******************************************************************************/

function writeLine(reporter, topic, message) {
  if (reporter) {
    reporter(topic, message);
  } else {
    console.warn(message);
  }
}

function writeCheck(reporter, entityId, prop, type, value) {
  writeLine(
    reporter,
    'bad-value',
    `${entityId}[${prop}] (type='${type}' value='${value}') Bad value`
  );
}

// Check basis types, and return false if it's not a basis type.
function checkBasis(reporter, entityId, prop, conf, value) {
  switch (conf.type) {
    case 'string':
      if (typeof value !== 'string') {
        writeCheck(reporter, entityId, prop, conf.type, value);
      }
      return true; // check done
    case 'bool':
      if (typeof value !== 'boolean') {
        writeCheck(reporter, entityId, prop, conf.type, value);
      }
      return true; // check done
    case 'array':
      if (!Array.isArray(value)) {
        writeCheck(reporter, entityId, prop, conf.type, value);
      }
      return true; // check done
    case 'object':
      if (typeof value !== 'object') {
        writeCheck(reporter, entityId, prop, conf.type, value);
      }
      return true; // check done
    case 'enum':
      if (!conf.values.includes(value)) {
        writeCheck(reporter, entityId, prop, conf.type, value);
      }
      return true; // check done
    default:
      return false; // todo complex check
  }
}

/******************************************************************************/

// Normalize metadata, clear unused properties and add missing properties to an entity.
module.exports = function(entity, reporter) {
  if (!entity) {
    writeLine(reporter, 'fatal', 'No entity to check...');
    return;
  }

  const type = entity.id.split('@')[0];

  /******************** Warnings for missing keys *************************/

  if (configurations[type].properties) {
    for (const [prop, conf] of Object.entries(
      configurations[type].properties
    )) {
      const value = entity[prop];
      if (!value) {
        writeLine(
          reporter,
          'missing-in-entity',
          `${entity.id}[${prop}] Missing root key/value`
        );
        continue;
      }
      if (!checkBasis(reporter, entity.id, prop, conf, value)) {
        // Check complex type.
        const converter = Converters.getConverter(conf.type);
        if (!converter) {
          writeLine(
            reporter,
            'fatal',
            `${entity.id}[${prop}] (${conf.type}) Converter not found`
          );
        } else if (!converter.check(value)) {
          writeLine(
            reporter,
            'bad-value',
            `${entity.id}[${prop}] (type='${conf.type}' value='${value}') Bad value for root key/value`
          );
        }
      }
    }
  }

  if (configurations[type].summaries) {
    for (const prop of Object.keys(configurations[type].summaries)) {
      if (!entity['meta']['summaries'][prop]) {
        writeLine(
          reporter,
          'missing-in-entity',
          `${entity.id}[meta][summaries][${prop}] Missing summary key/value`
        );
      }
    }
  }

  if (configurations[type].sums) {
    for (const prop of Object.keys(configurations[type].sums)) {
      if (!entity['sums'][prop]) {
        writeLine(
          reporter,
          'missing-in-entity',
          `${entity.id}[sums][${prop}] Missing sums key/value`
        );
      }
    }
  }

  /****************** Warnings for keys not in schema **********************/

  for (const prop of Object.keys(entity)) {
    // Exclude some keys to be checked.
    if (['meta', 'sums', 'id'].includes(prop)) {
      continue;
    }
    // If a prop is undefined, show warning.
    if (configurations[type] === undefined) {
      writeLine(
        reporter,
        'missing-in-schema',
        `${entity.id}[${prop}] Key and value not in schema`
      );
    }
  }

  if (entity.meta.summaries) {
    for (const prop of Object.keys(entity.meta.summaries)) {
      if (!configurations[type]['summaries'][prop]) {
        writeLine(
          reporter,
          'missing-in-schema',
          `${entity.id}[meta][summaries][${prop}] Key and value not in schema`
        );
      }
    }
  }

  if (entity.sums) {
    for (const prop of Object.keys(entity.sums)) {
      if (!configurations[type]['sums'][prop]) {
        writeLine(
          reporter,
          'missing-in-schema',
          `${entity.id}[sums][${prop}] Key and value not in schema`
        );
      }
    }
  }
};

/******************************************************************************/
