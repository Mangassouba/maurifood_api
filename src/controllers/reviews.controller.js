const { eq } = require('drizzle-orm')
const db = require('../config/db')
const { reviews } = require('../db/schema')
const { notifyRestaurant } = require('../lib/restaurantNotify')

const MAX_COMMENT_LENGTH = 500

// "Mohamed Ould Ahmed" -> "Mohamed O." : on n'affiche jamais le nom complet du client
function publicAuthorName(fullName) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Client'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

// --- Côté client : avis laissé depuis la page de suivi, avec le code de commande ---

async function createReview(req, res) {
  const rating = Number(req.body.rating)
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : ''

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'La note doit être comprise entre 1 et 5' })
  }
  if (comment.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `Le commentaire ne doit pas dépasser ${MAX_COMMENT_LENGTH} caractères` })
  }

  const order = await db.query.orders.findFirst({
    where: (orders, { eq }) => eq(orders.code, req.params.code.toUpperCase()),
    with: { review: { columns: { id: true } } },
  })
  if (!order) return res.status(404).json({ error: 'Commande introuvable' })
  if (order.status !== 'delivered') {
    return res.status(400).json({ error: 'Vous pourrez laisser un avis une fois la commande livrée ou retirée' })
  }
  if (order.review) {
    return res.status(409).json({ error: 'Un avis a déjà été laissé pour cette commande' })
  }

  let review
  try {
    ;[review] = await db
      .insert(reviews)
      .values({
        orderId: order.id,
        restaurantId: order.restaurantId,
        authorName: publicAuthorName(order.guestName),
        rating,
        comment: comment || null,
      })
      .returning()
  } catch (err) {
    // Deux envois simultanés pour la même commande
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Un avis a déjà été laissé pour cette commande' })
    }
    throw err
  }

  await notifyRestaurant({
    restaurantId: order.restaurantId,
    type: 'review.created',
    message: `Nouvel avis ${rating}/5 sur la commande ${order.code}`,
    link: '/dashboard/orders',
  })

  res.status(201).json(review)
}

// --- Public : avis affichés sur la page d'accueil ---

async function listPublicReviews(req, res) {
  const items = await db.query.reviews.findMany({
    where: (reviews, { eq }) => eq(reviews.isPublished, true),
    orderBy: (reviews, { desc }) => [desc(reviews.createdAt)],
    with: { restaurant: { columns: { name: true, slug: true, isActive: true } } },
  })

  const visible = items.filter((r) => r.restaurant?.isActive)
  const average = visible.length
    ? Math.round((visible.reduce((sum, r) => sum + r.rating, 0) / visible.length) * 10) / 10
    : null

  res.json({
    average,
    count: visible.length,
    // Le carrousel n'affiche que les avis avec un commentaire
    items: visible
      .filter((r) => r.comment)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        authorName: r.authorName,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        restaurant: { name: r.restaurant.name, slug: r.restaurant.slug },
      })),
  })
}

// --- Super admin : modération ---

async function listForAdmin(req, res) {
  const items = await db.query.reviews.findMany({
    orderBy: (reviews, { desc }) => [desc(reviews.createdAt)],
    limit: 200,
    with: {
      restaurant: { columns: { id: true, name: true } },
      order: { columns: { code: true } },
    },
  })
  res.json(items)
}

async function setPublished(req, res) {
  const [review] = await db
    .update(reviews)
    .set({ isPublished: Boolean(req.body.isPublished) })
    .where(eq(reviews.id, Number(req.params.id)))
    .returning()
  if (!review) return res.status(404).json({ error: 'Avis introuvable' })
  res.json(review)
}

module.exports = { createReview, listPublicReviews, listForAdmin, setPublished }
