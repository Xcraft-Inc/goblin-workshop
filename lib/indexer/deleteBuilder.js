'use strict';

module.exports = function (locales, mandate, type, entityId) {
  const body = [];

  for (let locale of locales) {
    locale = locale.get('name');
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
  }

  return body;
};
