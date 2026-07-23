'use strict';

const { Router }   = require('express');
const authenticate = require('../middleware/authenticate');
const aiController = require('../controllers/ai.controller');

const router = Router();

router.post('/ask', authenticate, aiController.ask);

module.exports = router;
