'use strict';

const { Router } = require('express');
const authRoutes         = require('./auth.routes');
const courseRoutes       = require('./course.routes');
const announcementRoutes = require('./announcement.routes');
const progressRoutes     = require('./progress.routes');
const adminRoutes        = require('./admin.routes');
const aiRoutes           = require('./ai.routes');
const videoRoutes        = require('./video.routes');
const discussionRoutes   = require('./discussion.routes');

const router = Router();

router.use('/auth',          authRoutes);
router.use('/courses',       courseRoutes);
router.use('/announcements', announcementRoutes);
router.use('/progress',      progressRoutes);
router.use('/admin',         adminRoutes);
router.use('/ai',            aiRoutes);
router.use('/lessons',       videoRoutes);
router.use('/discussions',   discussionRoutes);

module.exports = router;
