const { Router } = require('express')
const orders = require('../controllers/orders.controller')

const router = Router()

router.post('/orders', orders.createOrder)
router.get('/orders/code/:code', orders.getOrderByCode)

module.exports = router
