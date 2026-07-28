"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVideoSignedUrl = getVideoSignedUrl;
const bunny_service_1 = require("../services/bunny.service");
/**
 * Controller to fetch a secure, signed Bunny Stream embed URL.
 * Binds expiration to 5 minutes.
 */
async function getVideoSignedUrl(req, res, next) {
    try {
        if (!req.lesson || !req.lesson.videoId) {
            return res.status(404).json({ error: 'Video not found.' });
        }
        // Generate URL with 5 minute expiration (300 seconds)
        const signedUrl = (0, bunny_service_1.generateSignedEmbedUrl)(req.lesson.videoId, 300);
        return res.json({ url: signedUrl });
    }
    catch (err) {
        next(err);
    }
}
