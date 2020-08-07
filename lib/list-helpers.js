'use strict';

const {converters} = require('xcraft-core-converters');
const Converters = converters;
const Shredder = require('xcraft-core-shredder');

/******************************************************************************/

const extract = (regex) => (path, fallbackValue) => {
  const matches = path.match(regex);
  if (matches) {
    for (let i = 1; i < matches.length; ++i) {
      if (matches[i]) {
        return matches[i];
      }
    }
  }
  return fallbackValue;
};
const extractTarget = extract(/(.*)(?:\[|\/)/);
const extractPath = extract(/(?:([^/]*\])|(.*)\/)/);
const extractSubPath = extract(/(?:\]\.|\/)(.*)/);

function columnGetter(key, c) {
  if (typeof c === 'object') {
    if (!c.has(key)) {
      throw new Error('invalid column format');
    }
    return c.get(key);
  }
  return c;
}

function columnOptionalGetter(key, c) {
  if (typeof c === 'object') {
    if (!c.has(key)) {
      return null;
    }
    return c.get(key);
  }
  return c;
}

function isTargetingRef(entity, targetPath) {
  return (
    entity.get('meta.references') &&
    entity.get('meta.references').has(targetPath)
  );
}

function isTargetingValue(entity, targetPath) {
  return entity.get('meta.values') && entity.get('meta.values').has(targetPath);
}

function isTargetingValueOrRef(entity, targetPath) {
  return (
    isTargetingRef(entity, targetPath) || isTargetingValue(entity, targetPath)
  );
}

function getEstimatedWidth(columns, viewSettings) {
  let width = 0;
  for (const column of columns) {
    let w = column.get('width');

    if (viewSettings) {
      const userWidth = viewSettings.get(`widths.${column.get('id')}`, null);
      if (userWidth) {
        w = userWidth;
      }
    }

    if (w && w.endsWith('px')) {
      w = w.substring(0, w.length - 2);
    } else {
      w = 100;
    }
    w = parseInt(w);
    if (isNaN(w)) {
      w = 100;
    }
    width += w;
  }
  return width + 'px';
}

/******************************************************************************/

function getColumnProps(c, viewSettings) {
  const props = {width: '100px', wrap: 'no'};

  if (typeof c === 'object') {
    let w = c.get('width', null);

    if (viewSettings) {
      const userWidth = viewSettings.get(`widths.${c.get('id')}`, null);
      if (userWidth) {
        w = userWidth;
      }
    }

    if (w) {
      if (
        typeof w === 'number' ||
        (typeof w === 'string' && !w.endsWith('px'))
      ) {
        w += 'px';
      }
      props.width = w;
    }

    const ta = c.get('textAlign', null);
    if (ta) {
      props.textAlign = ta;
    } else {
      const type = columnOptionalGetter('type', c);
      switch (type) {
        case 'price':
        case 'number':
          props.textAlign = 'right';
          break;
      }
    }
  }

  return props;
}

function getColumnDisplayText(c, entity) {
  const type = columnOptionalGetter('type', c);
  const converter =
    type &&
    type !== 'string' &&
    type !== 'markdown' &&
    type !== 'enum' &&
    type !== 'bool'
      ? Converters.getConverter(type)
      : null;

  const columnPath = extractPath(
    columnGetter('path', c),
    columnGetter('path', c)
  );
  const text = columnPath && entity.get(columnPath, null);

  if (type === 'bool') {
    // Display glyph for bool.
    return new Shredder({glyph: text ? 'solid/check' : null});
  } else if (converter) {
    // Use xcraft-core-converters to convert.
    return converter.getDisplayed(text);
  } else {
    // Return canonical value for unknown type (fallback).
    return text;
  }
}

function getColumnHeaderText(c) {
  return columnGetter('text', c);
}

function getColumnType(c) {
  return columnOptionalGetter('type', c);
}

function getColumnPath(c) {
  return extractPath(columnGetter('path', c), columnGetter('path', c));
}

function getColumnTargetPath(c) {
  return extractTarget(columnGetter('path', c), columnGetter('path', c));
}

function getColumnSubPath(c) {
  return extractSubPath(columnGetter('path', c), null);
}

function skipRowIfEmpty(c) {
  if (typeof c === 'object') {
    if (!c.has('skipRowIfEmpty')) {
      return false;
    }
    return c.get('skipRowIfEmpty', true);
  }
  return false;
}

/******************************************************************************/

module.exports = {
  getColumnProps,
  getColumnHeaderText,
  getColumnDisplayText,
  getColumnType,
  getColumnPath,
  getColumnTargetPath,
  getColumnSubPath,
  skipRowIfEmpty,
  isTargetingValueOrRef,
  isTargetingValue,
  isTargetingRef,
  getEstimatedWidth,
};
