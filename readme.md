# SAP CAP — Consuming External Services (cds.connect.to & RemoteService)

CAP lets you consume external OData/REST services through `cds.connect.to()`. The same business code works in both development (local mock) and production (real backend) — only the configuration in `package.json` changes.

---

## Architecture

```
Your CAP app
  ├── package.json: cds.requires.SupplierService { kind, model }
  └── cat-service.js: cds.connect.to('SupplierService')
            ↓
  Profile switch (development → mock / production → real URL)
            ↓
  Development: local mock service + CSV data
  Production:  real URL + authentication
```

The business code (`cat-service.js`) never changes between environments.

---

## Scenario

`CatalogService` manages books. Each book has a `supplierID`. A `SupplierService` (simulating an external supplier system) is consumed to retrieve supplier info and stock.

---

## Project Structure

```
my-remoteservice/
├── db/
│   ├── schema.cds
│   └── data/
│       └── my.remote-Books.csv
├── srv/
│   ├── cat-service.cds
│   ├── cat-service.js
│   └── external/
│       ├── SupplierService.cds       ← local model of the external service
│       └── data/
│           └── SupplierService-Suppliers.csv  ← mock data
└── package.json
```

---

## Data Model

### `db/schema.cds`

```cds
namespace my.remote;
using { cuid, managed } from '@sap/cds/common';

entity Books : cuid, managed {
  title      : String(200);
  price      : Decimal(9, 2);
  supplierID : String(10);   // matches Suppliers.ID in the external service
}
```

### `db/data/my.remote-Books.csv`

```
ID,title,price,supplierID
b0000001-0000-0000-0000-000000000001,Clean Code,38.00,SUP01
b0000001-0000-0000-0000-000000000002,The Pragmatic Programmer,45.00,SUP02
b0000001-0000-0000-0000-000000000003,Refactoring,42.00,SUP01
```

---

## External Service Definition (local copy)

### `srv/external/SupplierService.cds`

```cds
service SupplierService {

  entity Suppliers {
    key ID      : String(10);
        name    : String(100);
        country : String(50);
        stock   : Integer;
        leadTimeDays : Integer;
  }
}
```

> In real projects, this file is usually generated automatically via `cds import` from the external service's `$metadata`. Here it's handwritten for learning purposes.

### `srv/external/data/SupplierService-Suppliers.csv`

```
ID,name,country,stock,leadTimeDays
SUP01,Global Books Inc,USA,100,3
SUP02,Euro Print Ltd,Germany,50,7
```

---

## package.json Configuration

```json
{
  "cds": {
    "requires": {
      "SupplierService": {
        "kind": "odata",
        "model": "srv/external/SupplierService"
      }
    }
  }
}
```

| Field | Meaning |
|---|---|
| `kind: "odata"` | The external service is an OData service — enables CDS QL queries |
| `model` | Path to the local CDS definition (no `.cds` extension) |

For production, add a profile-specific block:

```json
{
  "cds": {
    "requires": {
      "SupplierService": {
        "kind": "odata",
        "model": "srv/external/SupplierService",

        "[production]": {
          "credentials": {
            "url": "https://real-supplier-system.example.com/odata/v4/SupplierService",
            "authentication": "BasicAuthentication",
            "username": "{{SUPPLIER_USER}}",
            "password": "{{SUPPLIER_PASSWORD}}"
          }
        }
      }
    }
  }
}
```

---

## Service Definition

### `srv/cat-service.cds`

```cds
using my.remote as db from '../db/schema';

service CatalogService {
  entity Books as projection on db.Books;

  entity Books actions {
    function getSupplierInfo() returns {
      supplierName : String;
      stock        : Integer;
      leadTimeDays : Integer;
    };
  };
}
```

---

## Service Implementation

### `srv/cat-service.js`

```js
const cds = require('@sap/cds')

module.exports = class CatalogService extends cds.ApplicationService {
  async init() {
    const { Books } = this.entities

    // cds.connect.to() returns an object that can be queried
    // like a local service — same API in dev (mock) and prod (real)
    const SupplierService = await cds.connect.to('SupplierService')

    // Bound function: get supplier info for a single book
    this.on('getSupplierInfo', Books, async req => {
      const bookID = req.params[0].ID

      const book = await SELECT.one.from(Books).where({ ID: bookID })
      if (!book) return req.error(404, 'Book not found')

      // Query the external service's entity using CDS QL
      const supplier = await SupplierService.run(
        SELECT.one.from('Suppliers').where({ ID: book.supplierID })
      )
      if (!supplier) return req.error(404, 'Supplier info not found')

      return {
        supplierName: supplier.name,
        stock:        supplier.stock,
        leadTimeDays: supplier.leadTimeDays
      }
    })

    // after READ: enrich every book with the supplier name
    this.after('READ', Books, async (books) => {
      if (!books) return
      const list = Array.isArray(books) ? books : [books]

      for (const book of list) {
        if (book.supplierID) {
          try {
            const supplier = await SupplierService.run(
              SELECT.one.from('Suppliers').where({ ID: book.supplierID })
            )
            book.supplierName = supplier?.name ?? 'Unknown'
          } catch (err) {
            console.error('Calling SupplierService failed:', err.message)
            book.supplierName = 'Unknown'
          }
        }
      }
    })

    return super.init()
  }
}
```

---

## Required npm Packages

`RemoteService` (kind: `odata`/`rest`) depends on the SAP Cloud SDK:

```bash
npm install @sap-cloud-sdk/resilience @sap-cloud-sdk/http-client @sap-cloud-sdk/connectivity --save
```

---

## Running the Project

```bash
cds watch --with-mocks
```

`--with-mocks` is required — without it, external services declared with `external: true` are NOT exposed as local HTTP endpoints, even if a local model exists.

---

## Expected Startup Log

```
[cds] - connect to db > sqlite { url: ':memory:' }
  > init from db\data\my.remote-Books.csv
  > init from srv\external\data\SupplierService-Suppliers.csv
[cds] - serving CatalogService {
  at: [ '/odata/v4/catalog' ],
  ...
}
[cds] - mocking SupplierService {
  at: [ '/odata/v4/supplier' ],
  decl: 'srv\\external\\SupplierService.cds:4',
  impl: 'node_modules\\@sap\\cds\\srv\\app-service.js'
}
```

> CAP derives the mock path (`/odata/v4/supplier`) from the file path of `SupplierService.cds`, not from the service name. To fix the path, add `@path: '/odata/v4/SupplierService'` above the service declaration.

---

## HTTP Request Examples

### Mock endpoint — query supplier data directly
```http
GET /odata/v4/supplier/Suppliers
```
```json
{
  "value": [
    { "ID": "SUP01", "name": "Global Books Inc", "country": "USA", "stock": 100, "leadTimeDays": 3 },
    { "ID": "SUP02", "name": "Euro Print Ltd", "country": "Germany", "stock": 50, "leadTimeDays": 7 }
  ]
}
```

### Read books — supplierName is enriched via after READ
```http
GET /odata/v4/catalog/Books
```
Each book includes a `supplierName` field fetched from the mock SupplierService.

### Bound function — get supplier info for one book
```http
GET /odata/v4/catalog/Books(ID=b0000001-0000-0000-0000-000000000001)/getSupplierInfo()
```
```json
{
  "supplierName": "Global Books Inc",
  "stock": 100,
  "leadTimeDays": 3
}
```

---

## cds.connect.to() — Two Ways to Call External Services

```js
const SupplierService = await cds.connect.to('SupplierService')

// 1. Query an entity using CDS QL — most common
const suppliers = await SupplierService.run(
  SELECT.from('Suppliers').where({ country: 'USA' })
)

// 2. Call an action/function on the external service
const result = await SupplierService.send('someAction', { param: 'value' })
```

---

## Switching to a Real Backend

```bash
# Local development — uses mock
cds watch --with-mocks

# Simulate production config (still local)
cds watch --profile production
```

`cat-service.js` requires no changes — `cds.connect.to('SupplierService')` returns an object with the same interface in both environments.

---

## Gotchas

**`--with-mocks` is required to expose local mock services as HTTP endpoints**
```bash
# ❌ Without this flag, external services are connected but not exposed
cds watch

# ✅ Exposes mock services at their own paths
cds watch --with-mocks
```

**`@cds.persistence.skip` + `credentials.url` together can prevent mocking**
```cds
// ❌ This combination made CAP treat the service as "already has a real backend"
// and skip generating a mock endpoint
@cds.persistence.skip
service SupplierService { ... }
```
```json
// ❌ together with credentials.url in package.json — also blocks mocking
"SupplierService": { "credentials": { "url": "..." } }
```
```cds
// ✅ Simplest working setup for local mocking:
// remove @cds.persistence.skip, remove credentials.url
service SupplierService { ... }
```

**The mock path is derived from the file path, not the service name**
```
srv/external/SupplierService.cds  →  mocked at /odata/v4/supplier
(not /odata/v4/SupplierService)

// To control the path explicitly:
@path: '/odata/v4/SupplierService'
service SupplierService { ... }
```

**`Cannot find module '@sap-cloud-sdk/resilience'`**
```bash
# RemoteService (kind: odata/rest) needs the SAP Cloud SDK packages
npm install @sap-cloud-sdk/resilience @sap-cloud-sdk/http-client @sap-cloud-sdk/connectivity --save
```

**Custom functions/actions need a handler — mock entities don't auto-implement them**
```
# Error: Service "SupplierService" has no handler for "getSupplierInfo"

# Option A (recommended): query the entity directly instead of calling a function
SupplierService.run(SELECT.one.from('Suppliers').where({ ID: ... }))

# Option B: implement the handler in srv/external/SupplierService.js
# (CAP auto-detects a .js file with the same name as the mock implementation)
```

**Service name in `cds.connect.to()` must match the key in `cds.requires`, but the CDS service name in `.cds` doesn't need a namespace prefix**
```cds
// ❌ If the .cds file has: namespace external.supplier; service SupplierService { ... }
// the full service name becomes external.supplier.SupplierService
// — mismatches the package.json key "SupplierService"

// ✅ Remove the namespace line for a clean match
service SupplierService { ... }
Use cds compile to directly verify whether the file can be recognized.
cds compile srv/external/SupplierService.cds --service all
```
