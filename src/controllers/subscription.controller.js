const { asc } = require('drizzle-orm')
const db = require('../config/db')
const { plans } = require('../db/schema')

async function listPlans(req, res) {
  const items = await db.select().from(plans).orderBy(asc(plans.price))
  res.json(items)
}

async function mySubscription(req, res) {
  const subscription = await db.query.subscriptions.findFirst({
    where: (subscriptions, { eq }) => eq(subscriptions.restaurantId, req.restaurantId),
    with: { plan: true },
  })
  if (!subscription) {
    return res.status(404).json({ error: 'Aucun abonnement trouvé' })
  }
  res.json(subscription)
}

module.exports = { listPlans, mySubscription }
