const watt = require('gigawatts');
const buildMultiLanguageSummaries = require('goblin-nabu-store/lib/summaries.js');
const workshopConfig = require('xcraft-core-etc')().load('goblin-workshop');
const {indexerMappingsByType} = require('goblin-workshop').buildEntity;

module.exports = watt(function* (
  quest,
  mandate,
  type,
  entityId,
  entity,
  config,
  next
) {
  const doc = entity.meta.index;
  if (!type || !doc) {
    return null;
  }
  doc['meta/status'] = entity.meta.status;

  //alerts
  const hasErrors = entity.meta.hasErrors;
  if (hasErrors !== undefined) {
    doc['meta/hasErrors'] = entity.meta.hasErrors;
    doc['meta/hasWarnings'] = entity.meta.hasWarnings;
  }

  //auto indexed props
  const properties = config.properties;
  if (properties) {
    for (const [prop, info] of Object.entries(properties)) {
      if (info.type && info.type === 'enum') {
        doc[prop] = entity[prop] || info.defaultValue || '';
      }
      if (info.type && info.type === 'bool') {
        doc[prop] = entity[prop] || info.defaultValue || false;
      }
      if (info.type && info.type === 'date') {
        //only index a valid date or null
        let value = null;
        if (entity[prop] && !isNaN(new Date(entity[prop]))) {
          value = entity[prop];
        }
        doc[prop] = value;
      }
    }
  }
  const multiLanguageDoc = yield buildMultiLanguageSummaries(quest, doc, true);
  const mapping = indexerMappingsByType.find((mapping) => mapping.type === type)
    .properties;

  let body = [];
  if (workshopConfig.enableMultiLanguageIndex) {
    body = Object.entries(multiLanguageDoc).reduce((body, [locale, doc]) => {
      body.push({
        index: {
          _index:
            locale === '_original'
              ? mandate
              : `${mandate}-${locale.toLowerCase().replace(/\//g, '-')}`,
          _type: type,
          _id: entityId,
        },
      });
      if (doc.info) {
        doc.searchAutocomplete = doc.info;
        doc.searchPhonetic = doc.info;
      }
      if (mapping) {
        for (const prop of Object.keys(doc)) {
          const info = mapping[prop];

          if (info && info.type === 'date') {
            //only index a valid date or null
            if (isNaN(new Date(doc[prop]))) {
              doc[prop] = null;
            }
          }
        }
      }

      body.push(doc);
      return body;
    }, []);
  } else {
    const document = multiLanguageDoc._original;
    if (document['meta/status'] === 'trashed') {
      body.push({
        delete: {
          _index: mandate,
          _type: type,
          _id: entityId,
        },
      });
    } else {
      body.push({
        index: {
          _index: mandate,
          _type: type,
          _id: entityId,
        },
      });
      if (document.info) {
        document.searchAutocomplete = document.info;
        document.searchPhonetic = document.info;
      }
      body.push(document);
    }
  }
  return body;
});
