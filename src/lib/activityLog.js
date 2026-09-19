const { eq } = require('drizzle-orm')
const db = require('../config/db')
const { activityLogs, users } = require('../db/schema')

async function logActivity({ action, message, restaurantId = null, actorId = null }) {
  let actorEmail = null
  let actorRole = null

  if (actorId) {
    const [actor] = await db
      .select({ email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, actorId))
    if (actor) {
      actorEmail = actor.email
      actorRole = actor.role
    }
  }

  await db.insert(activityLogs).values({
    action,
    message: actorEmail ? `${message} (par ${actorEmail})` : message,
    actorEmail,
    actorRole,
    restaurantId,
  })
}

module.exports = { logActivity }
