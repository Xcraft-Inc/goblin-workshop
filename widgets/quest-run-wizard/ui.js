import React from 'react';

import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';
import Separator from 'gadgets/separator/widget';
import Field from 'gadgets/field/widget';

function prepare(props) {
  return (
    <Container kind="column" grow="1">
      <Label kind="title" text="Quest Launcher" />
      <Container kind="row">
        <Field labelText="payload" grow="1" rows="4" model=".form.payload" />
      </Container>
      <Container kind="row">
        <Field labelText="quest" model=".form.quest" />
      </Container>
    </Container>
  );
}

/******************************************************************************/
export default {
  prepare,
};