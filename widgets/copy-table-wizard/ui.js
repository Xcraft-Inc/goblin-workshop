import React from 'react';

import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';
import Separator from 'gadgets/separator/widget';
import Field from 'gadgets/field/widget';

function prepare(props) {
  return (
    <Container kind="column" grow="1">
      <Label text="Sélectionnez le mandat source" />
      <Separator kind="space" height="10px" />
      <Field
        kind="combo"
        labelText="Mandat"
        listModel=".form.databases"
        model=".form.fromDb"
      />
      <Separator kind="space" height="10px" />
      <Label text="Sélectionnez les entités à copier" />
      <Container kind="row">
        <Field
          kind="gadget"
          name="tablesTable"
          selectionMode="multi"
          frame="true"
          hasButtons="true"
          height="300px"
          grow="1"
        />
      </Container>
      <Separator kind="space" height="10px" />
      <Label text="Options:" />
      <Separator kind="space" height="10px" />
      <Container kind="row">
        <Field
          kind="bool"
          model=".form.reindex"
          labelText="Réindexer les entités"
        />
      </Container>
    </Container>
  );
}

/******************************************************************************/
export default {
  prepare,
};
