/// <reference path="../pb_data/types.d.ts" />
// Punti GPS grezzi inviati dal telefono. client_id rende la sync idempotente:
// se un batch viene reinviato dopo un errore di rete, i duplicati vengono rifiutati dall'indice unico.
migrate((app) => {
  const owner = "@request.auth.id != '' && user = @request.auth.id"

  const points = new Collection({
    type: "base",
    name: "points",
    listRule: owner,
    viewRule: owner,
    createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id",
    updateRule: null,
    deleteRule: owner,
    fields: [
      { type: "relation", name: "user", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "client_id", required: true },
      { type: "number", name: "ts", required: true },        // epoch ms dal fix GPS
      { type: "number", name: "lat", required: true },
      { type: "number", name: "lon", required: true },
      { type: "number", name: "accuracy" },                  // metri
      { type: "number", name: "speed" },                     // m/s
      { type: "number", name: "bearing" },
      { type: "number", name: "altitude" },
      { type: "text", name: "provider" },                    // gps / network / fused / dead_reckoning
      { type: "text", name: "activity" },                    // still / walking / vehicle ...
      { type: "number", name: "battery" },                   // % al momento del fix
      { type: "text", name: "device_id" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_points_user_client ON points (user, client_id)",
      "CREATE INDEX idx_points_user_ts ON points (user, ts)",
    ],
  })
  app.save(points)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("points"))
})
