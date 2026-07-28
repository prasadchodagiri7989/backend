"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSignedEmbedUrl = generateSignedEmbedUrl;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Generates a secure, short-lived signed embed URL for a Bunny Stream video.
 * Signature Formula: SHA256_HEX(token_security_key + video_id + expiration_timestamp)
 *
 * @param videoId The Bunny Stream video ID
 * @param ttlSeconds Expiration timeframe in seconds (default is 5 minutes / 300s)
 * @returns Fully qualified secure embed URL
 */
function generateSignedEmbedUrl(videoId, ttlSeconds = 300) {
    const libraryId = process.env.BUNNY_LIBRARY_ID;
    const tokenKey = process.env.BUNNY_TOKEN_KEY;
    if (!libraryId) {
        throw new Error('BUNNY_LIBRARY_ID is not defined in the environment variables.');
    }
    if (!tokenKey) {
        throw new Error('BUNNY_TOKEN_KEY is not defined in the environment variables.');
    }
    // Expiration is UNIX timestamp in seconds
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    // Construct SHA256 hash
    const message = tokenKey + videoId + expires;
    const token = crypto_1.default
        .createHash('sha256')
        .update(message)
        .digest('hex');
    // Base embed URL player.mediadelivery.net/embed/{libraryId}/{videoId}
    return `https://player.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}`;
}
