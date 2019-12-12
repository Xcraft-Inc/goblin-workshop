import T from 't';
import React from 'react';

import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';

/******************************************************************************/

function renderPanel(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
        <Field model=".kind" />
        <Field model=".labelText" />
        <Field model=".model" />
      </Container>
    </Container>
  );
}

function renderPlugin(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
        <Field model=".kind" />
        <Field model=".labelText" />
        <Field model=".model" />
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
};
