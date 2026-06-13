const cds = require('@sap/cds')

module.exports = class CatalogService extends cds.ApplicationService {
  async init() {
    const { Books } = this.entities

    // ─────────────────────────────────────────
    // cds.connect.to() — Connect to external services
    // Returns an object that can be invoked like a local service.
    // The development environment automatically uses mock data, while the production environment uses real URLs.
    // ─────────────────────────────────────────
    const SupplierService = await cds.connect.to('SupplierService')

    // ─────────────────────────────────────────
    // Bound Function: Query supplier information for a single book.
    // ─────────────────────────────────────────
    this.on('getSupplierInfo', Books, async req => {
      const bookID = req.params[0].ID

      const book = await SELECT.one.from(Books).where({ ID: bookID })
      if (!book) return req.error(404, 'book does not exist')

      // ─────────────────────────────────────
      // Calling external services: Method 1 — Entity query
      // Query external entities as you would query local entities
      // ─────────────────────────────────────
      const supplier = await SupplierService.run(
        SELECT.one.from('Suppliers').where({ ID: book.supplierID })
      )

      if (!supplier) return req.error(404, 'Supplier information does not exist')

      return {
        supplierName: supplier.name,
        stock:        supplier.stock,
        leadTimeDays: supplier.leadTimeDays
      }
    })


    // ─────────────────────────────────────────
    // after READ: Add supplier names to all books in batches.
    // ─────────────────────────────────────────
    this.after('READ', Books, async (books) => {
      if (!books) return
      const list = Array.isArray(books) ? books : [books]

      for (const book of list) {
        if (book.supplierID) {
          // ─────────────────────────────────
          // Calling external services: Method 2 — Calling a function
          // ─────────────────────────────────
          // try {
          //   const result = await SupplierService.send(
          //     'getSupplierInfo',
          //     { supplierID: book.supplierID }
          //   )
          //   book.supplierName = result?.name
          // } catch (err) {
          //   console.error('Calling SupplierService failed.:', err.message)
          //   book.supplierName = 'Unknown'
          // }
          try {
            // Use entity queries instead, without calling functions.
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