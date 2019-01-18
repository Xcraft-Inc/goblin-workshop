import React from 'react';

import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';
import Separator from 'gadgets/separator/widget';
import Field from 'gadgets/field/widget';

function prepare(props) {
  return (
    <Container kind="column" grow="1">
      <Label kind="title" text="Entity Flow" />
      <Container kind="row">
        <Field labelText="path" model=".form.path" />
      </Container>
      <Container kind="row">
        <Field labelText="type" model=".form.type" />
      </Container>
      <Container kind="row">
        <Field labelText="action" model=".form.action" />
      </Container>
    </Container>
  );
}

/******************************************************************************/
export default {
  prepare,
};
