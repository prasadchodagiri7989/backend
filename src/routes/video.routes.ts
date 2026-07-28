import { Router } from 'express';
import { authorizeVideoAccess } from '../middleware/auth';
import { getVideoSignedUrl } from '../controllers/video.controller';

const router = Router();

// GET /api/lessons/:lessonId/video (mounted under /lessons in routes/index.js)
router.get('/:lessonId/video', authorizeVideoAccess, getVideoSignedUrl);

export = router;
