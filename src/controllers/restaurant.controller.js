const { eq } = require('drizzle-orm')
const db = require('../config/db')
const { restaurants } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

async function getProfile(req, res) {
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, req.restaurantId))
  if (!restaurant) return res.status(404).json({ error: 'Restaurant introuvable' })
  res.json(restaurant)
}

async function updateProfile(req, res) {
  const { name, description, phone, address, lat, lng, logoUrl } = req.body

  const data = {}
  if (name !== undefined) data.name = name
  if (description !== undefined) data.description = description
  if (phone !== undefined) data.phone = phone
  if (address !== undefined) data.address = address
  if (logoUrl !== undefined) data.logoUrl = logoUrl
  if (lat !== undefined) data.lat = lat === '' || lat === null ? null : Number(lat)
  if (lng !== undefined) data.lng = lng === '' || lng === null ? null : Number(lng)

  const [restaurant] = await db
    .update(restaurants)
    .set(data)
    .where(eq(restaurants.id, req.restaurantId))
    .returning()

  await logActivity({
    action: 'restaurant.profile_updated',
    message: `Profil modifié : ${restaurant.name}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.json(restaurant)
}

module.exports = { getProfile, updateProfile }
