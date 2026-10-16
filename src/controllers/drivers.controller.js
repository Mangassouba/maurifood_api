const { eq, and } = require('drizzle-orm')
const db = require('../config/db')
const { drivers, orders } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

function findDriver(req) {
  return db
    .select()
    .from(drivers)
    .where(and(eq(drivers.id, Number(req.params.id)), eq(drivers.restaurantId, req.restaurantId)))
    .then((rows) => rows[0])
}

async function list(req, res) {
  const items = await db
    .select()
    .from(drivers)
    .where(eq(drivers.restaurantId, req.restaurantId))
    .orderBy(drivers.name)
  res.json(items)
}

async function create(req, res) {
  const { name, phone, vehicle } = req.body
  if (!name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'Nom et téléphone du livreur requis' })
  }

  const [driver] = await db
    .insert(drivers)
    .values({
      restaurantId: req.restaurantId,
      name: name.trim(),
      phone: phone.trim(),
      vehicle: vehicle?.trim() || null,
    })
    .returning()

  await logActivity({
    action: 'driver.created',
    message: `Livreur ajouté : ${driver.name}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(201).json(driver)
}

async function update(req, res) {
  const existing = await findDriver(req)
  if (!existing) return res.status(404).json({ error: 'Livreur introuvable' })

  const { name, phone, vehicle, isActive } = req.body
  const data = {}
  if (name !== undefined) data.name = name.trim()
  if (phone !== undefined) data.phone = phone.trim()
  if (vehicle !== undefined) data.vehicle = vehicle?.trim() || null
  if (isActive !== undefined) data.isActive = Boolean(isActive)
  if (data.name === '' || data.phone === '') {
    return res.status(400).json({ error: 'Nom et téléphone du livreur requis' })
  }

  const [updated] = await db
    .update(drivers)
    .set(data)
    .where(eq(drivers.id, existing.id))
    .returning()

  await logActivity({
    action: 'driver.updated',
    message: `Livreur modifié : ${updated.name}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.json(updated)
}

async function remove(req, res) {
  const existing = await findDriver(req)
  if (!existing) return res.status(404).json({ error: 'Livreur introuvable' })

  // Un livreur qui a déjà livré des commandes est désactivé plutôt que supprimé,
  // pour garder l'historique des livraisons.
  const [used] = await db.select({ id: orders.id }).from(orders).where(eq(orders.driverId, existing.id)).limit(1)
  if (used) {
    const [updated] = await db
      .update(drivers)
      .set({ isActive: false })
      .where(eq(drivers.id, existing.id))
      .returning()
    await logActivity({
      action: 'driver.deactivated',
      message: `Livreur désactivé : ${existing.name}`,
      restaurantId: req.restaurantId,
      actorId: req.user.id,
    })
    return res.json({ deactivated: true, driver: updated })
  }

  await db.delete(drivers).where(eq(drivers.id, existing.id))

  await logActivity({
    action: 'driver.deleted',
    message: `Livreur supprimé : ${existing.name}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(204).send()
}

module.exports = { list, create, update, remove }
