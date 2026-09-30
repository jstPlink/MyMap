/// <reference path="../pb_data/types.d.ts" />
// L'app Android invia i punti con POST /api/batch, disattivato di default in PocketBase.
migrate((app) => {
  const settings = app.settings()
  settings.batch.enabled = true
  settings.batch.maxRequests = 300
  app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.batch.enabled = false
  app.save(settings)
})
