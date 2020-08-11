const util = require('util');
const {mkdir} = require('xcraft-core-fs');
const path = require('path');

///TODO:
// - symlink node-modules and use a custom directory like /tmp/userland

const buildPackageFile = (name) => `{
  "name": "${name}",
  "version": "0.0.1",
  "description": "User module",
  "author": "",
  "license": "MIT",
  "config": {
    "xcraft": {
      "commands": true
    }
  },
  "dependencies": {
    "goblin-workshop": "^1.0.0",
    "xcraft-core-goblin": "^3.0.0"
  },
  "devDependencies": {
    "prettier": "2.0.4",
    "xcraft-dev-prettier": "^2.0.0",
    "xcraft-dev-rules": "^2.0.0"
  },
  "prettier": "xcraft-dev-prettier"
}
`;
const buildEntityServiceHandlerFile = (type) => `
console.log('WORKSHOP-USERLAND "${type}" MODULE LOADING...')
exports.xcraftCommands = function () {
  return require('./entities/${type}.js').service;
};
`;

const buildEntityServiceFile = (type, config) => `
'use strict';
console.log('WORKSHOP-USERLAND "${type}" MODULE LOADING...[DONE]')
const {buildEntity} = require('goblin-workshop');
const entity = ${util.inspect(config, {
  breakLength: 80,
})};

entity.onNew = function (quest, id) {
  return {id};
};

module.exports = {
  entity,
  service: buildEntity(entity),
};
`;

module.exports = function (entityState) {
  const entityType = entityState.get('type');
  const modulePath = path.join(
    '/home/sam/devel/westeros-dev/userland/',
    `workshop-${entityType}`
  );
  const entitiesPath = path.join(modulePath, 'entities');
  mkdir(entitiesPath);

  const properties = Array.from(entityState.get('private.properties').values());
  const entityConfig = {
    type: entityState.get('type'),
    properties: properties.reduce((props, p) => {
      props[p.get('name')] = {
        type: p.get('type'),
        defaultValue: null,
      };
      return props;
    }, {}),
  };

  const fs = require('fs');
  const packageFile = buildPackageFile(`workshop-${entityType}`);
  const entityFile = buildEntityServiceFile(entityType, entityConfig);
  const entityServiceHandler = buildEntityServiceHandlerFile(entityType);

  const packageFilePath = path.join(modulePath, 'package.json');
  const handlerFilePath = path.join(modulePath, `${entityType}.js`);
  const entityFilePath = path.join(entitiesPath, `${entityType}.js`);

  fs.writeFileSync(packageFilePath, packageFile);
  fs.writeFileSync(entityFilePath, entityFile);
  fs.writeFileSync(handlerFilePath, entityServiceHandler);
};
