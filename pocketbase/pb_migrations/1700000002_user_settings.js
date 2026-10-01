/// <reference path="../pb_data/types.d.ts" />
// Campo JSON `settings` sull'utente: l'app ci salva le impostazioni (esagoni, heatmap, notti, linee, tema, nomi dei posti),
// così si ritrovano dopo una reinstallazione o su un altro telefono. L'utente può modificare solo il proprio record.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  if (!users.fields.getByName("settings")) users.fields.add(new JSONField({ name: "settings", maxSize: 500000 }))
  users.fields.getByName("password").min = 5 // di default PocketBase vuole almeno 8 caratteri
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("settings")
  app.save(users)
})
