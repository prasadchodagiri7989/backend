"use strict";
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const video_controller_1 = require("../controllers/video.controller");
const router = (0, express_1.Router)();
// GET /api/lessons/:lessonId/video (mounted under /lessons in routes/index.js)
router.get('/:lessonId/video', auth_1.authorizeVideoAccess, video_controller_1.getVideoSignedUrl);
module.exports = router;
