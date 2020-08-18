const watt = require('gigawatts');
const buildMultiLanguageSummaries = require('goblin-nabu-store/lib/summaries.js');

module.exports = watt(function* (quest, mandate, type, entityId, entity) {
  const doc = entity.meta.index;
  const multiLanguageDoc = yield buildMultiLanguageSummaries(quest, doc, true);
  const body = Object.keys(multiLanguageDoc).reduce((body, locale) => {
    body.push({
      delete: {
        _index:
          locale === '_original'
            ? mandate
            : `${mandate}-${locale.toLowerCase().replace(/\//g, '-')}`,
        _id: entityId,
        _type: type,
      },
    });
    return body;
  }, []);
  return body;
});
