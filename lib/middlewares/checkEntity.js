const {configurations} = require('../entity-builder.js');

// Normalize metadata, clear unused properties and add missing properties to an entity

module.exports = function(entity) {
  if (!entity) {
    console.log('No entity to check...');
    return;
  }
  const meta = entity.meta;
  const type = entity.id.split('@')[0];
  const conf = configurations[type];

  // Check in meta data ?

  meta.version = entity.meta.version || 1;
  meta.id = entity.id;
  meta.type = type;
  meta.references = conf.references || {};
  meta.values = conf.values || {};
  meta.summaries = conf.summaries || {};
  meta.sums = conf.sums || {};

  /******************** Warnings for missing keys *************************/

  if (configurations[type].properties) {
    for (const [prop, conf] of Object.entries(
      configurations[type].properties
    )) {
      if (!entity[prop]) {
        console.warn(`${entity.id}[${prop}] Missing root key/value !`);
        continue;
      }
      // if (![conf.type].check(entity[prop])) {
      //   console.warn(`${entity.id}[${prop}] Bad value for root key/value !`);
      // }
    }
  }

  if (configurations[type].meta.summaries) {
    for (const prop of Object.keys(configurations[type].summaries)) {
      if (!entity['meta']['summaries'][prop]) {
        console.warn(
          `${entity.id}[meta][summaries][${prop}] Missing summarie key/value !`
        );
      }
    }
  }

  if (configurations[type].sums) {
    for (const prop of Object.keys(configurations[type].sums)) {
      if (!entity['sums'][prop]) {
        console.warn(`${entity.id}[sums][${prop}] Missing sums key/value !`);
      }
    }
  }

  /****************** Warnings for keys not in schema **********************/

  for (const prop of Object.keys(entity)) {
    // Exclude some keys to be checked
    if (['meta', 'sums', 'id'].includes(prop)) {
      continue;
    }
    // If a prop is undefined, show warning
    if (configurations[type] === undefined) {
      console.warn(`${entity.id}[${prop}] key and value not in schema !`);
    }
  }

  if (entity.meta.summaries) {
    for (const prop of Object.keys(entity.meta.summaries)) {
      if (!configurations[type]['summaries'][prop]) {
        console.warn(
          `${entity.id}[meta][summaries][${prop}] key and value not in schema !`
        );
      }
    }
  }

  if (entity.sums) {
    for (const prop of Object.keys(entity.sums)) {
      if (!configurations[type]['sums'][prop]) {
        console.warn(
          `${entity.id}[sums][${prop}] key and value not in schema !`
        );
      }
    }
  }
};
