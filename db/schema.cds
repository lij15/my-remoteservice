namespace my.remote;
using { cuid, managed } from '@sap/cds/common';

entity Books : cuid, managed {
  title      : String(200);
  price      : Decimal(9, 2);
  supplierID : String(10);   // Corresponding supplier ID in the external SupplierService
}