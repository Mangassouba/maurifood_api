const { Router } = require('express')
const {
  listDishes,
  getDish,
  listRestaurants,
  getRestaurant,
} = require('../controllers/public.controller')

const router = Router()

router.get('/dishes', listDishes)
router.get('/dishes/:id', getDish)
router.get('/restaurants', listRestaurants)
router.get('/restaurants/:slug', getRestaurant)

module.exports = router
