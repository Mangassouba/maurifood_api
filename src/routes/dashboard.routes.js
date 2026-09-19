const { Router } = require('express')
const { authRequired, requireRole } = require('../middlewares/auth.middleware')
const restaurantScope = require('../middlewares/restaurantScope.middleware')
const dishes = require('../controllers/dishes.controller')
const orders = require('../controllers/orders.controller')
const deliveryZones = require('../controllers/deliveryZones.controller')
const subscription = require('../controllers/subscription.controller')
const categories = require('../controllers/categories.controller')
const restaurant = require('../controllers/restaurant.controller')
const staff = require('../controllers/staff.controller')
const notifications = require('../controllers/notifications.controller')

const router = Router()

router.use(authRequired, requireRole('restaurant_owner', 'staff'), restaurantScope)

router.get('/dishes', dishes.list)
router.post('/dishes', dishes.create)
router.put('/dishes/:id', dishes.update)
router.delete('/dishes/:id', dishes.remove)

router.get('/categories', categories.list)
router.post('/categories', categories.create)
router.delete('/categories/:id', categories.remove)

router.get('/orders', orders.listForRestaurant)
router.put('/orders/:id/status', orders.updateStatus)

router.get('/delivery-zones', deliveryZones.list)
router.post('/delivery-zones', deliveryZones.create)
router.put('/delivery-zones/:id', deliveryZones.update)
router.delete('/delivery-zones/:id', deliveryZones.remove)

router.get('/subscription', subscription.mySubscription)
router.post(
  '/renewal-request',
  requireRole('restaurant_owner'),
  notifications.createRenewalRequest,
)

router.get('/restaurant', restaurant.getProfile)
router.put('/restaurant', restaurant.updateProfile)

router.get('/users', requireRole('restaurant_owner'), staff.list)
router.post('/users', requireRole('restaurant_owner'), staff.create)
router.delete('/users/:id', requireRole('restaurant_owner'), staff.remove)

module.exports = router
