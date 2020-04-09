const watt = require('gigawatts');
const buildMultiLanguageSummaries = require('goblin-nabu-store/lib/summaries.js');

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
  const body = Object.entries(multiLanguageDoc).reduce(
    (body, [locale, doc]) => {
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
      body.push(doc);
      return body;
    },
    []
  );
  return body;
});
