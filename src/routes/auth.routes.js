const { Router } = require('express')
const { login, register, logout } = require('../controllers/auth.controller')
const { authRequired } = require('../middlewares/auth.middleware')

const router = Router()

router.post('/login', login)
router.post('/register', register)
router.post('/logout', authRequired, logout)

module.exports = router
