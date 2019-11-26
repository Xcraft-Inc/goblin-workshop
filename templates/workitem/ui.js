const getPanelFields = fields => {
  return fields.map(field => {
    return `<Field kind="${field.type}" model=".${field.name}"/>`;
  });
};

const getPanelCollections = collections => {
  return collections.map(collection => {
    return `<Field kind="ids" model=".${collection.name}"/>`;
  });
};
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
      \`${getPanelFields(fields).join('\n')}\`
      </Container>
      \`${getPanelCollections(collections).join('\n')}\`
    </Container>
  );
}

function renderPlugin(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
      \`${getPanelFields(fields).join('\n')}\`
      </Container>
      \`${getPanelCollections(collections).join('\n')}\`
    </Container>
  );
}



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
