const { Router } = require('express')
const orders = require('../controllers/orders.controller')
const reviews = require('../controllers/reviews.controller')

const router = Router()

router.post('/orders', orders.createOrder)
router.get('/orders/code/:code', orders.getOrderByCode)
router.post('/orders/code/:code/review', reviews.createReview)

module.exports = router
