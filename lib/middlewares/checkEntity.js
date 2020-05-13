const {configurations} = require('../entity-builder.js');
const {converters} = require('xcraft-core-converters');
const common = require('../workitems/common.js');
const Converters = converters;

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
  const type = conf.type;
  const topic = `bad-${conf.type}-value`;

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
          type,
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
          type,
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
          type,
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
          type,
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
            type,
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
            type,
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
          type,
          'check-value-fields',
          'fix-value-fields',
          fix,
          entityFixPatch
        );
      }
      break;
    case 'array':
      if (isNotNull(value) && !Array.isArray(value)) {
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
          type,
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
          type,
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
          type,
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
            'typed',
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
  for (const [prop, info] of Object.entries(configuration[mode + 's'])) {
    const type = common.getReferenceType(info);
    const typePointer = `pointer-${mode}`;
    const isCollection = common.referenceUseArity(info);
    if (isCollection) {
      const collection = entity[prop];
      if (!collection || !Array.isArray(collection)) {
        const fix = {
          topic: `missing-pointer-${mode}`,
          entityId: entity.id,
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
            entityId: entity.id,
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
            entityId: entity.id,
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
      if (!entity.hasOwnProperty(prop)) {
        const fix = {
          topic: `missing-pointer-${mode}`,
          entityId: entity.id,
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

      const reference = entity[prop];
      if (reference) {
        if (reference.indexOf('@') === -1) {
          const fix = {
            topic: `bad-pointer-${mode}`,
            entityId: entity.id,
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
            entityId: entity.id,
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

  const type = entity.id.split('@')[0];
  const configuration = configurations[type];

  /******************** Warnings for bad references/values *************************/

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

  /******************** Warnings for missing keys *************************/

  if (configuration.properties) {
    for (const [prop, conf] of Object.entries(configuration.properties)) {
      if (!entity.hasOwnProperty(prop)) {
        const fix = {
          topic: 'missing-in-entity',
          entityId: entity.id,
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
          entity.id,
          prop,
          conf,
          entity[prop],
          entityFixPatch
        );
      }
    }
  }

  if (configuration.summaries) {
    for (const [prop, conf] of Object.entries(configuration.summaries)) {
      if (
        !options.includes('check-missing-fields') &&
        !options.includes('fix-missing-fields')
      ) {
        continue;
      }
      if (!entity['meta']) {
        report(reporter, {
          topic: 'missing-meta',
          entityId: entity.id,
          path: 'meta',
          pathType: conf.type,
          value: null,
          valueType: null,
          correction: null,
          message: 'Missing metadata',
        });
        needRehydrating = true;
        continue;
      }
      if (!entity['meta']['summaries']) {
        report(reporter, {
          topic: 'missing-summaries',
          entityId: entity.id,
          path: 'meta.summaries',
          pathType: conf.type,
          value: null,
          valueType: null,
          correction: null,
          message: 'Missing summaries',
        });
        needRehydrating = true;
        continue;
      }
      if (!entity['meta']['summaries'].hasOwnProperty(prop)) {
        report(reporter, {
          topic: 'missing-in-entity',
          entityId: entity.id,
          path: `meta.summaries.${prop}`,
          pathType: conf.type,
          value: null,
          valueType: null,
          correction: null,
          message: 'Missing summary key/value',
        });
        needRehydrating = true;
        continue;
      }
    }
  }

  if (configuration.sums) {
    for (const [prop, conf] of Object.entries(configuration.sums)) {
      if (
        !options.includes('check-missing-fields') &&
        !options.includes('fix-missing-fields')
      ) {
        continue;
      }
      if (!entity['sums']) {
        report(reporter, {
          topic: 'missing-sums',
          entityId: entity.id,
          path: 'sums',
          pathType: conf.type,
          value: null,
          valueType: null,
          correction: null,
          message: 'Missing sums',
        });
        needRehydrating = true;
        continue;
      }
      if (!entity['sums'].hasOwnProperty(prop)) {
        report(reporter, {
          topic: 'missing-in-entity',
          entityId: entity.id,
          path: `sums.${prop}`,
          pathType: conf.type,
          value: null,
          valueType: null,
          correction: null,
          message: 'Missing sums key/value',
        });
        needRehydrating = true;
        continue;
      }
    }
  }

  /****************** Warnings for keys not in schema **********************/

  if (options.includes('delete-undefined-schema-props')) {
    for (const prop of Object.keys(entity)) {
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
        const value = entity[prop];
        const fix = {
          topic: 'missing-in-properties-schema',
          entityId: entity.id,
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

    if (entity.meta.summaries) {
      for (const prop of Object.keys(entity.meta.summaries)) {
        if (configuration['summaries'][prop] === undefined) {
          const fix = {
            topic: 'missing-in-summaries-schema',
            entityId: entity.id,
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

    if (entity.sums && configuration.sums) {
      for (const prop of Object.keys(entity.sums)) {
        if (configuration['sums'][prop] === undefined) {
          const fix = {
            topic: 'missing-in-sums-schema',
            entityId: entity.id,
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
    if (configurations.rules) {
      for (const rule of Object.keys(configurations.rules)) {
        const ruleChecker = configurations.rules[rule];
        if (ruleChecker.match(entity)) {
          // override existent patch (potentialy) by business rule !!!
          entityFixPatch = {...entityFixPatch, ...ruleChecker.patch(entity)};
          report(reporter, {
            topic: 'rule-applied',
            entityId: entity.id,
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
    entityId: entity.id,
    rootAggregateId: entity.meta.rootAggregateId,
    rootAggregatePath: entity.meta.rootAggregatePath,
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

module.exports = {
  checkEntity,
  checkProperty,
};
