import React from 'react';
import Container from 'goblin-gadgets/widgets/container/widget.js';
import Field from 'goblin-gadgets/widgets/field/widget.js';
/******************************************************************************/

function renderPanel(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
        <Field labelText="Type" model=".type" />
      </Container>
      <Field kind="ids" model=".properties" plugin="property" />
    </Container>
  );
}

function renderPlugin(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
        <Field labelText="Type" model=".type" />
      </Container>
      <Field kind="ids" model=".properties" plugin="property" />
    </Container>
  );
}

/******************************************************************************/

function mapper(state) {
  return {
    entity: state,
  };
}

export default {
  mappers: {
    panel: {
      edit: mapper,
      readonly: mapper,
    },
    plugin: {
      edit: mapper,
      readonly: mapper,
    },
  },
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
};
