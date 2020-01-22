import React from 'react';

import EntityBrowser from 'goblin-gadgets/widgets/entity-browser/widget';
import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';

/******************************************************************************/

function renderPanel(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
        <Field labelText="Intitulé" model=".text" />
        <Field labelText="Chemin" model=".path" />
      </Container>
      <Container kind="row">
        <EntityBrowser entityId={'workshop'} />
      </Container>
    </Container>
  );
}

function renderPlugin(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
        <Field labelText="Intitulé" model=".text" />
      </Container>
      <Container kind="row">
        <Field labelText="Chemin" model=".path" />
      </Container>
      <Container kind="row">
        <EntityBrowser entityId={'workshop'} />
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
