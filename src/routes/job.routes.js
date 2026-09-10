'use strict';

const { Router } = require('express');
const optionalAuth = require('../middleware/optionalAuth');
const jobController = require('../controllers/job.controller');

const router = Router();

router.use(optionalAuth);

router.get('/', jobController.getJobs);
router.get('/:id', jobController.getJobById);

module.exports = router;
