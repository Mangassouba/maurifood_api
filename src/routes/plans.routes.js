const { Router } = require('express')
const { listPlans } = require('../controllers/subscription.controller')

const router = Router()

router.get('/', listPlans)

module.exports = router
