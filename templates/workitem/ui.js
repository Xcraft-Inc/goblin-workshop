function getPanelField(field) {
  const fieldName = field.name;
  return `<Field kind="${field.type}" labelText={T('${fieldName}')} model=".${fieldName}" />`;
}

function getPanelCollection(collection) {
  const collectionName = collection.name;
  // TODO : do someting with prop plugin ? widgetImporter in component Field !?!?!
  // plugin={plugin-${''}}
  return `<Field kind="ids" pluginType="${collectionName}" model=".${collectionName}" />`;
}

function getPanelFields(fields) {
  return fields.map(field => getPanelField(field));
}

function getPanelCollections(collections) {
  return collections.map(collection => getPanelCollection(collection));
}

/******************************************************************************/

module.exports = (fields, collections) => {
  return `import T from 't';
import React from 'react';

import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';
import Label from 'goblin-gadgets/widgets/label/widget';

/******************************************************************************/

function renderPanel(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
      ${getPanelFields(fields).join('\n\t')}
      </Container>
      <Container kind="pane">
      ${getPanelCollections(collections).join('\n\t')}
      </Container>
    </Container>
  );
}

function renderPlugin(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
      ${getPanelFields(fields).join('\n\t')}
      </Container>
      <Container kind="row">
      ${getPanelCollections(collections).join('\n\t')}
	  </Container>
   </Container>
  );
}

/******************************************************************************/

export default {
  panel: {
    readonly: renderPanel,
    edit: renderPanel,
  },
  plugin: {
    readonly: {
      compact: renderPlugin,
      extend: renderPlugin,
    },
    edit: {
      compact: renderPlugin,
      extend: renderPlugin,
    },
  },
};`;
};
