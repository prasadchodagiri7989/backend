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
router.post('/courses/:id/modules/:moduleId/topics/:topicId/attachments',                  admin.addAttachment);
router.put('/courses/:id/modules/:moduleId/topics/:topicId/attachments/:attachmentId',    admin.renameAttachment);
router.delete('/courses/:id/modules/:moduleId/topics/:topicId/attachments/:attachmentId', admin.deleteAttachment);

// ── Activity & Sync ───────────────────────────────────────────────────────
router.get('/activity',   admin.getActivity);
router.post('/sync-prod-to-uat', admin.syncProdToUat);

// ── Suspicious ─────────────────────────────────────────────────────────────
router.get('/suspicious', admin.getSuspiciousActivity);
router.post('/suspicious/:id/reset-ips', admin.resetUserIps);
router.post('/users/:id/reset-ips', admin.resetUserIps);

// ── Announcements ──────────────────────────────────────────────────────────
router.get('/announcements',              admin.getAnnouncements);
router.post('/announcements',             admin.createAnnouncement);
router.put('/announcements/:announcementId',    admin.updateAnnouncement);
router.delete('/announcements/:announcementId', admin.deleteAnnouncement);

// ── Batches ────────────────────────────────────────────────────────────────
const adminBatch = require('../controllers/adminBatch.controller');
router.get('/batches',                  adminBatch.getBatches);
router.get('/batches/:id',             adminBatch.getBatchById);
router.post('/batches',                 adminBatch.createBatch);
router.put('/batches/:id',              adminBatch.updateBatch);
router.delete('/batches/:id',           adminBatch.deleteBatch);
router.post('/batches/:id/members',     adminBatch.addMember);
router.delete('/batches/:id/members/:userId', adminBatch.removeMember);
router.post('/batches/:id/courses',     adminBatch.alignCourses);
// ── Job Scraper & Job Portal ───────────────────────────────────────────────
const adminJob = require('../controllers/adminJob.controller');
router.get('/job-scraper/health',                   adminJob.checkHealth);
router.post('/job-scraper/scrape',                  adminJob.scrapeJobs);
router.get('/job-scraper/history',                  adminJob.getSearchHistory);
router.get('/job-scraper/history/:searchId',        adminJob.getSearchJobs);
router.get('/job-scraper/export-csv/:searchId',     adminJob.exportScrapedCsv);
router.post('/job-scraper/export-csv',              adminJob.exportScrapedCsv);
router.get('/job-scraper/export-html/:searchId',    adminJob.exportScrapedHtml);
router.post('/job-scraper/export-html',             adminJob.exportScrapedHtml);

router.post('/jobs/publish',                        adminJob.publishJobs);
router.get('/jobs/published',                       adminJob.getPublishedJobs);
router.delete('/jobs/published/:id',                adminJob.deletePublishedJob);
router.get('/jobs/export-csv',                      adminJob.exportPublishedCsv);
router.get('/jobs/export-html',                     adminJob.exportPublishedHtml);

module.exports = router;

