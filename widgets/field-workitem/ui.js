import T from 't';
import React from 'react';

import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';

/******************************************************************************/

function renderPanel(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
        <Field labelText="Type du champ" model=".kind" />
        <Field labelText="Étiquette" model=".labelText" />
        <Field labelText="Nom de la propriété" model=".model" />
      </Container>
    </Container>
  );
}

function renderPlugin(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
        <Field labelText="Type du champ" model=".kind" />
      </Container>
      <Container kind="row">
        <Field labelText="Étiquette" model=".labelText" />
      </Container>
      <Container kind="row">
        <Field
          labelText="Nom de la propriété"
          labelWidth="200px"
          model=".model"
        />
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
