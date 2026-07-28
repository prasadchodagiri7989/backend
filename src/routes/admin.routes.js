'use strict';

const { Router }   = require('express');
const authenticate = require('../middleware/authenticate');
const adminOnly    = require('../middleware/adminOnly');
const admin        = require('../controllers/admin.controller');

const router = Router();

// Every admin route requires a valid JWT + admin role
router.use(authenticate, adminOnly);

// ── Stats ──────────────────────────────────────────────────────────────────
router.get('/stats', admin.getStats);

// ── Users ──────────────────────────────────────────────────────────────────
router.get('/users',              admin.getUsers);
router.post('/users',             admin.createUser);
router.post('/users/bulk',        admin.bulkCreateUsers);
router.put('/users/:id',          admin.updateUser);
router.delete('/users/:id',       admin.deleteUser);
router.post('/users/block/:id',   admin.blockUser);
router.post('/users/unblock/:id', admin.unblockUser);

// ── Courses ────────────────────────────────────────────────────────────────
router.get('/courses',         admin.getCourses);
router.post('/courses',        admin.createCourse);
router.post('/courses/upload-thumbnail', admin.uploadThumbnail);
router.put('/courses/:id',     admin.updateCourse);
router.delete('/courses/:id',  admin.deleteCourse);

// ── Modules ────────────────────────────────────────────────────────────────
const adminExtra = require('../controllers/adminCourse.controller');

router.post('/courses/:id/modules',              admin.addModule);
router.delete('/courses/:id/modules/:moduleId',  admin.deleteModule);
router.put('/courses/:id/modules/reorder',       adminExtra.reorderModules);
router.put('/courses/:id/modules/:moduleId',     adminExtra.updateModule);
router.post('/courses/:id/modules/:moduleId/duplicate', adminExtra.duplicateModule);
router.post('/courses/:id/modules/:moduleId/copy-to/:targetCourseId', adminExtra.copyModuleToCourse);

// ── Topics ─────────────────────────────────────────────────────────────────
router.post('/courses/:id/modules/:moduleId/topics',                  admin.addTopic);
router.delete('/courses/:id/modules/:moduleId/topics/:topicId',       admin.deleteTopic);
router.put('/courses/:id/modules/:moduleId/topics/:topicId/notes',    admin.updateTopicNotes);
router.put('/courses/:id/modules/:moduleId/topics/reorder',           adminExtra.reorderTopics);
router.put('/courses/:id/modules/:moduleId/topics/:topicId',          adminExtra.updateTopic);

// ── Activity ───────────────────────────────────────────────────────────────
router.get('/activity',   admin.getActivity);

// ── Suspicious ─────────────────────────────────────────────────────────────
router.get('/suspicious', admin.getSuspiciousActivity);

// ── Announcements ──────────────────────────────────────────────────────────
router.get('/announcements',              admin.getAnnouncements);
router.post('/announcements',             admin.createAnnouncement);
router.put('/announcements/:announcementId',    admin.updateAnnouncement);
router.delete('/announcements/:announcementId', admin.deleteAnnouncement);

module.exports = router;
