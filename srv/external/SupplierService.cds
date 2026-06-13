//namespace external.supplier;

//@cds.persistence.skip  // The table is not created in the local database; it is purely for type definition.
service SupplierService {

  entity Suppliers {
    key ID      : String(10);
        name    : String(100);
        country : String(50);
        stock   : Integer;
        leadTimeDays : Integer;
  }

  function getSupplierInfo(supplierID: String) returns {
    name : String;
    stock : Integer;
    leadTimeDays : Integer;
  };
}