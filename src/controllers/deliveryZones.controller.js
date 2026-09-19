const { eq, and } = require('drizzle-orm')
const db = require('../config/db')
const { deliveryZones } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

async function list(req, res) {
  const zones = await db
    .select()
    .from(deliveryZones)
    .where(eq(deliveryZones.restaurantId, req.restaurantId))
  res.json(zones)
}

async function create(req, res) {
  const { zoneName, fee, estimatedTimeMinutes } = req.body
  const [zone] = await db
    .insert(deliveryZones)
    .values({ restaurantId: req.restaurantId, zoneName, fee, estimatedTimeMinutes })
    .returning()

  await logActivity({
    action: 'delivery_zone.created',
    message: `Zone de livraison ajoutée : ${zone.zoneName}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(201).json(zone)
}

async function update(req, res) {
  const [existing] = await db
    .select()
    .from(deliveryZones)
    .where(
      and(
        eq(deliveryZones.id, Number(req.params.id)),
        eq(deliveryZones.restaurantId, req.restaurantId),
      ),
    )
  if (!existing) return res.status(404).json({ error: 'Zone introuvable' })

  const [updated] = await db
    .update(deliveryZones)
    .set(req.body)
    .where(eq(deliveryZones.id, existing.id))
    .returning()

  await logActivity({
    action: 'delivery_zone.updated',
    message: `Zone de livraison modifiée : ${updated.zoneName}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.json(updated)
}

async function remove(req, res) {
  const [existing] = await db
    .select()
    .from(deliveryZones)
    .where(
      and(
        eq(deliveryZones.id, Number(req.params.id)),
        eq(deliveryZones.restaurantId, req.restaurantId),
      ),
    )
  if (!existing) return res.status(404).json({ error: 'Zone introuvable' })

  await db.delete(deliveryZones).where(eq(deliveryZones.id, existing.id))

  await logActivity({
    action: 'delivery_zone.deleted',
    message: `Zone de livraison supprimée : ${existing.zoneName}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(204).send()
}

module.exports = { list, create, update, remove }
