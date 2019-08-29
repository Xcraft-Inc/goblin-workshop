# entity storage provider

## database and schema 

//todo

## required quest implementations

```js

set({
    table,
    documents,
})

setIn({
    table,
    documentId,
    path,
    value,
})

get({
    table,
    documentId,
    privateState,
})


getAll({ table, documentIds })

getView({
    table,
    documents,
    view,
})

listDb()

listTableFromDb({
    fromDb,
})

copyTableFromDb({ fromDb, table }

query({ query, args })
```