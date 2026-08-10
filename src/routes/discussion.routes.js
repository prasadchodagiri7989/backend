'use strict';

const { Router }   = require('express');
const authenticate = require('../middleware/authenticate');
const discussion   = require('../controllers/discussion.controller');

const router = Router();

// All discussion routes require authentication
router.use(authenticate);

router.get('/',     discussion.getDiscussions);
router.get('/replies-activity', discussion.getRepliesActivity);
router.post('/',    discussion.createDiscussion);
router.delete('/:id', discussion.deleteDiscussion);

module.exports = router;
