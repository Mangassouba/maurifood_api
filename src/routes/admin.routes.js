const { Router } = require('express')
const { authRequired, requireRole } = require('../middlewares/auth.middleware')
const admin = require('../controllers/admin.controller')
const { listPlans } = require('../controllers/subscription.controller')
const notifications = require('../controllers/notifications.controller')

const router = Router()

router.use(authRequired, requireRole('super_admin'))

router.get('/restaurants', admin.listRestaurants)
router.put('/restaurants/:id/active', admin.setRestaurantActive)
router.put('/restaurants/:id/subscription', admin.upsertSubscription)
router.get('/plans', listPlans)

router.get('/notifications', notifications.listForAdmin)
router.put('/notifications/:id/read', notifications.markRead)

router.get('/activity-logs', admin.listActivityLogs)

module.exports = router
