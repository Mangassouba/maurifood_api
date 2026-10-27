const { Router } = require('express')
const {
  listDishes,
  getDish,
  listRestaurants,
  getRestaurant,
} = require('../controllers/public.controller')
const images = require('../controllers/images.controller')
const reviews = require('../controllers/reviews.controller')

const router = Router()

router.get('/reviews', reviews.listPublicReviews)
router.get('/dishes', listDishes)
router.get('/dishes/:id', getDish)
router.get('/restaurants', listRestaurants)
router.get('/restaurants/:slug', getRestaurant)
router.get('/images/:id', images.show)

module.exports = router
