using my.remote as db from '../db/schema';

service CatalogService {
  entity Books as projection on db.Books
  actions {
    // bound function：Search for supplier information for a specific book
    function getSupplierInfo() returns {
      supplierName : String;
      stock        : Integer;
      leadTimeDays : Integer;
    };
  };
}