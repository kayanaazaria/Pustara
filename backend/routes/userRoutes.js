const express = require('express');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/recommendations', userController.getRecommendedUsers);
router.get('/me', userController.getMyProfile);
router.get('/me/following', userController.getMyFollowing);
router.get('/me/followers', userController.getMyFollowers);
router.put('/me', userController.updateMyProfile);
router.get('/:id', userController.getUserProfile);
router.post('/:id/follow', userController.followUser);
router.delete('/:id/unfollow', userController.unfollowUser);

module.exports = router;
