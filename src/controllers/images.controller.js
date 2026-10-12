const { eq } = require('drizzle-orm')
const db = require('../config/db')
const { images } = require('../db/schema')

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

async function upload(req, res) {
  const mimeType = req.get('content-type')
  if (!ALLOWED_TYPES.includes(mimeType) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Image invalide (JPEG, PNG ou WebP)' })
  }

  const [image] = await db
    .insert(images)
    .values({ restaurantId: req.restaurantId, mimeType, data: req.body })
    .returning({ id: images.id })

  res.status(201).json({ id: image.id, path: `/public/images/${image.id}` })
}

async function show(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(404).end()

  const [image] = await db.select().from(images).where(eq(images.id, id))
  if (!image) return res.status(404).end()

  res.set('Content-Type', image.mimeType)
  res.set('Cache-Control', 'public, max-age=31536000, immutable')
  res.send(image.data)
}

module.exports = { upload, show }
