# PouchDB Data Provider For React-Admin

Client-side data provider for [react-admin](https://github.com/marmelab/react-admin), the frontend framework for building admin applications on top of REST/GraphQL services.

This data provider takes a PouchDB object as input, then creates a client-side data provider around it.

Requires PouchDB-find plugin.

## Installation

```sh
npm install --save https://github.com/roldaojr/ra-data-pouchdb
```

## Usage

Create a PouchDB instance and pass to the provider constructor:

```jsx
// in src/App.js
import * as React from "react";
import { Admin, Resource } from 'react-admin';
import PouchDdProvider from 'ra-data-pouchdb';
import PouchDB from 'pouchdb-browser';
import PouchDBfind from 'pouchdb-find';

PouchDB.plugin(PouchDBfind);

const db = PouchDB("mydb");

const dataProvider = PouchDdProvider(db);

import { PostList } from './posts';

const App = () => (
    <Admin dataProvider={dataProvider}>
        <Resource name="posts" list={PostList} />
    </Admin>
);

export default App;
```

## Features

- working
  - pagination
  - sorting (requires secondary indexes)
- not working
  - filtering by column
  - full text search
