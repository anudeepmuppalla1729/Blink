const router = require('express').Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.put('/profile', protect, authController.updateProfile);

module.exports = router;
