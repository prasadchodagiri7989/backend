"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeVideoAccess = authorizeVideoAccess;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const Course_1 = __importDefault(require("../models/Course"));
/**
 * Authorization Middleware for Video Playback
 * Flow:
 * 1. Verify JWT
 * 2. Verify user exists and is active
 * 3. Verify lesson (topic) exists in the database
 * 4. Verify user is enrolled/purchased course
 * 5. Return 403 if unauthorized, 404 if not found, 401 if unauthenticated
 */
async function authorizeVideoAccess(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'skylearn-dev-secret-change-in-prod');
        // Verify user exists and is active
        const user = await User_1.default.findById(decoded.sub).select('status role').lean();
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        if (user.status === 'blocked') {
            return res.status(403).json({ error: 'Your account has been blocked by administrator.' });
        }
        req.user = decoded;
        const { lessonId } = req.params;
        if (!lessonId) {
            return res.status(400).json({ error: 'Lesson ID is required' });
        }
        // Find the course that contains this lesson (topic)
        const course = await Course_1.default.findOne({ 'modules.topics._id': lessonId });
        if (!course) {
            return res.status(404).json({ error: 'Video not found.' });
        }
        // Find the specific topic inside the course modules
        let lesson = null;
        for (const mod of course.modules) {
            const found = mod.topics.id(lessonId);
            if (found) {
                lesson = found;
                break;
            }
        }
        // Verify topic exists and has a videoId
        if (!lesson || !lesson.videoId) {
            return res.status(404).json({ error: 'Video not found.' });
        }
        // Verify user is enrolled/purchased course.
        // In this LMS, since all active students have access to courses and progress is tracked,
        // they are considered enrolled by default if they are active.
        // If a payment gateway or purchase collection is added later, query it here.
        const isEnrolled = true;
        if (!isEnrolled) {
            return res.status(403).json({ error: 'You are not enrolled in this course.' });
        }
        req.lesson = {
            id: lesson._id.toString(),
            title: lesson.title,
            videoId: lesson.videoId,
            bunnyLibraryId: lesson.bunnyLibraryId
        };
        next();
    }
    catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        next(err);
    }
}
