const {converters} = require('xcraft-core-converters');
const Converters = converters;
const {isShredder, isList} = require('xcraft-core-shredder');
const Goblin = require('xcraft-core-goblin');

/******************************************************************************/

function report(reporter, params) {
  if (reporter) {
    reporter(params);
  } else {
    console.warn('No reporter!');
  }
}

function fixPath(
  reporter,
  types,
  options,
  type,
  checkOption,
  fixOption,
  fix,
  entityFixPatch
) {
  if (!types || types.includes(type)) {
    if (options.includes(checkOption)) {
      report(reporter, fix);
    }
    if (options.includes(fixOption)) {
      entityFixPatch[fix.path] = fix.correction;
    }
  }
}

function removeField(reporter, options, fix, pointerToRemove) {
  if (options.includes('check-undefined-schema-fields')) {
    report(reporter, fix);
  }
  if (options.includes('delete-undefined-schema-fields')) {
    pointerToRemove.push(fix.path);
  }
}

function removePointer(reporter, types, options, type, fix, pointerToRemove) {
  if (types.includes(type)) {
    if (options.includes('check-undefined-schema-fields')) {
      report(reporter, fix);
    }
    if (options.includes('delete-undefined-schema-fields')) {
      pointerToRemove.push(fix.path);
    }
  }
}

function isNotNull(value) {
  return value !== null;
}

function getReportValue(entity, prop) {
  let value = entity.get(prop);
  if (value && value.toJS) {
    value = value.toJS();
  }
  return value;
}

/******************************************************************************/

function checkType(
  reporter,
  types,
  options,
  entityId,
  prop,
  conf,
  value,
  entityFixPatch
) {
  const path = prop;
  const pathType = conf.type;
  const topic = `bad-${conf.type}-value`;

  if (value === undefined && !conf.required) {
    const fix = {
      topic,
      entityId,
      path,
      pathType,
      value: 'undefined',
      correction: conf.defaultValue,
      message: 'undefined value found',
    };
    fixPath(
      reporter,
      types,
      options,
      pathType,
      'check-value-fields',
      'fix-value-fields',
      fix,
      entityFixPatch
    );
    return;
  }

  if (
    conf.required &&
    (value === null || value === undefined || value === '')
  ) {
    const fix = {
      topic,
      entityId,
      path,
      pathType,
      value:
        value === null
          ? 'null'
          : value === undefined
          ? 'undefined'
          : 'empty string',
      correction: conf.defaultValue,
      message: 'Required value missing',
    };
    fixPath(
      reporter,
      types,
      options,
      pathType,
      'check-value-fields',
      'fix-value-fields',
      fix,
      entityFixPatch
    );
    return;
  }

  switch (pathType) {
    case 'entityId':
      if (isNotNull(value) && typeof value !== 'string') {
        const fix = {
          topic,
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          correction: null,
          message: 'Bad entityId value',
        };
        fixPath(
          reporter,
          types,
          options,
          pathType,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
      } else if (
        isNotNull(value) &&
        typeof value === 'string' &&
        value.indexOf('@') === -1
      ) {
        const fix = {
          topic,
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          correction: null,
          message: 'Bad entityId',
        };
        fixPath(
          reporter,
          types,
          options,
          pathType,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
      }
      break;
    case 'string':
      if (isNotNull(value) && typeof value !== 'string') {
        const fix = {
          topic,
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          correction: value.toString(),
          message: 'Bad string value',
        };
        fixPath(
          reporter,
          types,
          options,
          pathType,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
      }
      break;
    case 'bool':
      if (value === null) {
        const fix = {
          topic,
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          correction: conf.defaultValue,
          message: 'Null boolean detected',
        };
        fixPath(
          reporter,
          types,
          options,
          pathType,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
      } else if (typeof value === 'string') {
        // For historical reason, bool fields can contains string "false" or "true"!
        if (value === 'false' || value === 'true') {
          const fix = {
            topic,
            entityId,
            path,
            pathType,
            value,
            valueType: typeof value,
            correction: value === 'true', // set native boolean true/false
            message:
              'String boolean detected (temporarily accepted for historical reasons)',
          };
          fixPath(
            reporter,
            types,
            options,
            pathType,
            'check-value-fields',
            'fix-value-fields',
            fix,
            entityFixPatch
          );
        } else {
          const fix = {
            topic,
            entityId,
            path,
            pathType,
            value,
            valueType: typeof value,
            correction: conf.defaultValue,
            message: 'Bad string boolean detected',
          };
          fixPath(
            reporter,
            types,
            options,
            pathType,
            'check-value-fields',
            'fix-value-fields',
            fix,
            entityFixPatch
          );
        }
      } else if (typeof value !== 'boolean') {
        const fix = {
          topic,
          entityId,
          path,
          pathType,
          value,
          correction: conf.defaultValue,
          message: 'Bad value',
        };
        fixPath(
          reporter,
          types,
          options,
          pathType,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
      }
      break;
    case 'array':
      if (isNotNull(value) && !isList(value)) {
        const fix = {
          topic,
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          correction: [],
          message: 'Bad array value',
        };
        fixPath(
          reporter,
          types,
          options,
          pathType,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
      }
      break;
    case 'object':
      if (isNotNull(value) && typeof value !== 'object') {
        const fix = {
          topic,
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          correction: null,
          message: 'Bad object value',
        };
        fixPath(
          reporter,
          types,
          options,
          pathType,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
      }
      break;
    case 'enum':
      if (!conf.values.includes(value)) {
        const fix = {
          topic,
          entityId,
          path,
          pathType,
          value,
          valueType: typeof value,
          correction: conf.defaultValue,
          message: 'Bad enum value',
        };
        fixPath(
          reporter,
          types,
          options,
          pathType,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
      }
      break;
    default:
      {
        const converter = Converters.getConverter(pathType);
        if (!converter) {
          if (options.includes('check-value-fields')) {
            report(reporter, {
              topic: 'fatal',
              entityId,
              path,
              pathType,
              value,
              valueType: typeof value,
              correction: null,
              message: 'Converter not found',
            });
          }
        } else if (
          isNotNull(value) &&
          value !== '' &&
          !converter.check(value)
        ) {
          const fix = {
            topic: 'bad-typed-value',
            entityId,
            path,
            pathType,
            value,
            valueType: typeof value,
            correction: conf.defaultValue,
            message: 'Bad typed value',
          };
          fixPath(
            reporter,
            types,
            options,
            pathType,
            'check-value-fields',
            'fix-value-fields',
            fix,
            entityFixPatch
          );
        }
      }
      break;
  }
}

/******************************************************************************/

function checkPointers(
  configuration,
  mode, // reference/value
  entity,
  reporter,
  types,
  options,
  pointerToRemove,
  entityFixPatch
) {
  if (!configuration[mode + 's']) {
    return;
  }

  const common = require('../workitems/common.js');
  for (const [prop, info] of Object.entries(configuration[mode + 's'])) {
    const type = common.getReferenceType(info);
    const typePointer = `pointer-${mode}`;
    const isCollection = common.referenceUseArity(info);
    if (isCollection) {
      const collection = entity.get(prop);
      if (!collection || !isList(collection)) {
        const fix = {
          topic: `missing-pointer-${mode}`,
          entityId: entity.get('id'),
          path: prop,
          pathType: type,
          value: null,
          valueType: null,
          correction: [],
          message: 'Missing collection',
        };
        fixPath(
          reporter,
          types,
          options,
          typePointer,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
        continue;
      }
      for (const id of collection) {
        if (id.indexOf('@') === -1) {
          const fix = {
            topic: `bad-pointer-${mode}`,
            entityId: entity.get('id'),
            path: prop,
            pathType: type,
            value: id,
            valueType: null,
            correction: null,
            message: 'Strange id',
          };
          removePointer(
            reporter,
            types,
            options,
            typePointer,
            fix,
            pointerToRemove
          );
          continue;
        }
        const existingType = id.split('@')[0];
        if (existingType !== type) {
          const fix = {
            topic: `bad-pointer-${mode}`,
            entityId: entity.get('id'),
            path: prop,
            pathType: type,
            value: id,
            valueType: existingType,
            correction: null,
            message: 'Entity pointed by id has a bad type',
          };
          removePointer(
            reporter,
            types,
            options,
            typePointer,
            fix,
            pointerToRemove
          );
          continue;
        }
      }
    } else {
      if (!entity.has(prop)) {
        const fix = {
          topic: `missing-pointer-${mode}`,
          entityId: entity.get('id'),
          path: prop,
          pathType: type,
          value: null,
          valueType: null,
          correction: null,
          message: 'Missing pointer',
        };
        fixPath(
          reporter,
          types,
          options,
          typePointer,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
        continue;
      }

      const reference = entity.get(prop);
      if (reference) {
        if (reference.indexOf('@') === -1) {
          const fix = {
            topic: `bad-pointer-${mode}`,
            entityId: entity.get('id'),
            path: prop,
            pathType: type,
            value: reference,
            valueType: typeof value,
            correction: null,
            message: 'Strange id',
          };
          removePointer(
            reporter,
            types,
            options,
            typePointer,
            fix,
            pointerToRemove
          );
          continue;
        }
        const existingType = reference.split('@')[0];
        if (existingType !== type) {
          const fix = {
            topic: `bad-pointer-${mode}`,
            entityId: entity.get('id'),
            path: prop,
            pathType: type,
            value: reference,
            valueType: existingType,
            correction: null,
            message: 'Entity pointed by id has a bad type',
          };
          removePointer(
            reporter,
            types,
            options,
            typePointer,
            fix,
            pointerToRemove
          );
          continue;
        }
      }
    }
  }
}

/******************************************************************************/

// Function to check entity (add missing properties to an entity and clear unused properties).
// reporter: Function to log warnings/errors
function checkEntity(entity, reporter, types, options) {
  if (!isShredder(entity)) {
    entity = new Goblin.Shredder(entity);
  }

  const {configurations} = require('../entity-builder.js');
  let entityFixPatch = {};
  const propsToRemove = [];
  const pointerToRemove = [];
  let needRehydrating = false;

  if (!entity) {
    if (
      options.includes('check-value-fields') ||
      options.includes('check-missing-fields') ||
      options.includes('check-undefined-schema-fields')
    ) {
      report(reporter, {
        topic: 'fatal',
        entityId: 'undefined',
        path: '',
        pathType: '',
        value: null,
        valueType: null,
        correction: null,
        message: 'No entity to check',
      });
    }
    return null;
  }

  const type = entity.get('id').split('@')[0];
  const configuration = configurations[type];

  /******************** Warnings for bad references/values *************************/

  if (
    !options.includes('check-only-meta') &&
    !options.includes('check-only-sums')
  ) {
    checkPointers(
      configuration,
      'value',
      entity,
      reporter,
      types,
      options,
      pointerToRemove,
      entityFixPatch
    );
    checkPointers(
      configuration,
      'reference',
      entity,
      reporter,
      types,
      options,
      pointerToRemove,
      entityFixPatch
    );
  }

  /******************** Warnings for missing keys *************************/

  if (
    configuration.properties &&
    !options.includes('check-only-meta') &&
    !options.includes('check-only-sums')
  ) {
    for (const [prop, conf] of Object.entries(configuration.properties)) {
      //skip sub level props
      if (prop.includes('.')) {
        continue;
      }
      if (!entity.has(prop)) {
        const fix = {
          topic: 'missing-in-entity',
          entityId: entity.get('id'),
          path: prop,
          pathType: conf.type,
          value: null,
          valueType: null,
          correction: conf.defaultValue,
          message: 'Missing root key/value',
        };
        fixPath(
          reporter,
          types,
          options,
          conf.type,
          'check-missing-fields',
          'fix-missing-fields',
          fix,
          entityFixPatch
        );
      } else {
        checkType(
          reporter,
          types,
          options,
          entity.get('id'),
          prop,
          conf,
          entity.get(prop),
          entityFixPatch
        );
      }
    }
  }

  const meta = entity.get('meta');
  const summaries = meta ? meta.get('summaries') : null;
  const sums = entity.get('sums');

  if (
    configuration.summaries &&
    (options.includes('check-only-meta') ||
      (!options.includes('check-skip-meta') &&
        (options.includes('check-missing-fields') ||
          options.includes('fix-missing-fields'))))
  ) {
    if (!meta) {
      report(reporter, {
        topic: 'missing-meta',
        entityId: entity.get('id'),
        path: 'meta',
        pathType: null,
        value: null,
        valueType: null,
        correction: null,
        message: 'Missing metadata',
      });
      needRehydrating = true;
    } else if (!summaries) {
      report(reporter, {
        topic: 'missing-summaries',
        entityId: entity.get('id'),
        path: 'meta.summaries',
        pathType: null,
        value: null,
        valueType: null,
        correction: null,
        message: 'Missing summaries',
      });
      needRehydrating = true;
    } else {
      for (const [prop, conf] of Object.entries(configuration.summaries)) {
        if (!summaries.has(prop)) {
          report(reporter, {
            topic: 'missing-in-entity',
            entityId: entity.get('id'),
            path: `meta.summaries.${prop}`,
            pathType: conf.type,
            value: null,
            valueType: null,
            correction: null,
            message: 'Missing summary key/value',
          });
          needRehydrating = true;
        }
      }
    }
  }

  if (
    configuration.sums &&
    (options.includes('check-only-sums') ||
      (!options.includes('check-skip-sums') &&
        (options.includes('check-missing-fields') ||
          options.includes('fix-missing-fields'))))
  ) {
    if (!sums) {
      report(reporter, {
        topic: 'missing-sums',
        entityId: entity.get('id'),
        path: 'sums',
        pathType: null,
        value: null,
        valueType: null,
        correction: null,
        message: 'Missing sums',
      });
      needRehydrating = true;
    } else {
      for (const [prop, conf] of Object.entries(configuration.sums)) {
        if (!sums.has(prop)) {
          report(reporter, {
            topic: 'missing-in-entity',
            entityId: entity.get('id'),
            path: `sums.${prop}`,
            pathType: conf.type,
            value: null,
            valueType: null,
            correction: null,
            message: 'Missing sums key/value',
          });
          needRehydrating = true;
        }
      }
    }
  }

  /****************** Warnings for keys not in schema **********************/

  if (
    options.includes('check-undefined-schema-fields') ||
    options.includes('delete-undefined-schema-props')
  ) {
    for (const prop of entity.keys()) {
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
        const value = getReportValue(entity, prop);

        const fix = {
          topic: 'missing-in-properties-schema',
          entityId: entity.get('id'),
          path: prop,
          pathType: '',
          value,
          valueType: typeof value,
          correction: null,
          message: 'Property is not described in schema',
        };
        removeField(reporter, options, fix, pointerToRemove);
      }
    }

    if (summaries) {
      for (const prop of summaries.keys()) {
        if (configuration['summaries'][prop] === undefined) {
          const fix = {
            topic: 'missing-in-summaries-schema',
            entityId: entity.get('id'),
            path: `summaries.${prop}`,
            pathType: '',
            value: null,
            valueType: null,
            correction: null,
            message: 'Summary is not described in schema',
          };
          removeField(reporter, options, fix, pointerToRemove);
        }
      }
    }

    if (sums && configuration.sums) {
      for (const prop of sums.keys()) {
        if (configuration['sums'][prop] === undefined) {
          const fix = {
            topic: 'missing-in-sums-schema',
            entityId: entity.get('id'),
            path: `sums.${prop}`,
            pathType: '',
            value: null,
            valueType: null,
            correction: null,
            message: 'Sums is not described in schema',
          };
          removeField(reporter, options, fix, pointerToRemove);
        }
      }
    }
  }

  /****************** Apply business rules defined in entity **********************/

  if (options.includes('apply-business-rules')) {
    if (configuration.rules) {
      for (const rule of Object.keys(configuration.rules)) {
        const ruleChecker = configuration.rules[rule];
        if (ruleChecker.match(entity)) {
          // Override existent patch (potentialy) by business rule !!!
          entityFixPatch = {...entityFixPatch, ...ruleChecker.patch(entity)};
          report(reporter, {
            topic: 'rule-applied',
            entityId: entity.get('id'),
            pathType: '',
            value: null,
            valueType: null,
            correction: null,
            message: 'Business rule successfully applied !',
          });
        }
      }
    }
  }

  return {
    entityId: entity.get('id'),
    rootAggregateId: meta ? meta.get('rootAggregateId') : null,
    rootAggregatePath: meta ? meta.get('rootAggregatePath') : null,
    entityFixPatch,
    propsToRemove,
    pointerToRemove,
    needRehydrating,
  };
}

/******************************************************************************/

function checkProperty(entityId, propertyName, propertyInfo, value) {
  const fixes = [];
  const entityFixPatch = {};

  //wrap when needed
  if (
    value &&
    typeof value === 'object' &&
    !Goblin.Shredder.isShredder(value)
  ) {
    value = new Goblin.Shredder(value);
  }
  // value = true; // uncomment to test bad properties!

  checkType(
    (params) => {
      fixes.push(params);
    },
    null,
    [
      'check-value-fields',
      'check-missing-fields',
      'check-undefined-schema-fields',
    ],
    entityId,
    propertyName,
    propertyInfo,
    value,
    entityFixPatch
  );

  if (fixes.length === 0) {
    return null;
  } else {
    return fixes[0];
  }
}

/******************************************************************************/

function completesEntityWithDefaultValues(goblinName, entity) {
  const {configurations} = require('../entity-builder.js');
  const type = entity.get('id').split('@')[0];
  const configuration = configurations[type];

  if (configuration.properties) {
    for (const [prop, conf] of Object.entries(configuration.properties)) {
      // Ignore prop names with 2 levels. By example:
      // 'partTypes.base': {type: 'percent', defaultValue: '1'},
      if (!prop.includes('.')) {
        if (entity.get(prop) === undefined) {
          entity = entity.set(prop, conf.defaultValue);
        }
      }
    }
  }

  // Examples for references or values:
  //    missionTickets: 'missionOrderTicket[]',
  //    desks: 'desk[0..n]',
  //    orderedByCustomerId: 'customer',

  if (configuration.references) {
    for (const [prop, conf] of Object.entries(configuration.references)) {
      if (entity.get(prop) === undefined) {
        const defaultValue = conf.endsWith(']') ? [] : null;
        entity = entity.set(prop, defaultValue);
      }
    }
  }

  if (configuration.values) {
    for (const [prop, conf] of Object.entries(configuration.values)) {
      if (entity.get(prop) === undefined) {
        const defaultValue = conf.endsWith(']') ? [] : null;
        entity = entity.set(prop, defaultValue);
      }
    }
  }

  return entity;
}

/******************************************************************************/

module.exports = {
  checkEntity,
  checkProperty,
  completesEntityWithDefaultValues,
};
