const db = require('../config/db')
const { restaurantNotifications } = require('../db/schema')

// Une notification ne doit jamais faire échouer l'action qui la déclenche.
async function notifyRestaurant({ restaurantId, type, message, link = null }) {
  try {
    await db.insert(restaurantNotifications).values({ restaurantId, type, message, link })
  } catch (err) {
    console.error('[notifications] Échec de la création de la notification', err)
  }
}

module.exports = { notifyRestaurant }
