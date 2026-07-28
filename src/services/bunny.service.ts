import crypto from 'crypto';

/**
 * Generates a secure, short-lived signed embed URL for a Bunny Stream video.
 * Signature Formula: SHA256_HEX(token_security_key + video_id + expiration_timestamp)
 *
 * @param videoId The Bunny Stream video ID
 * @param ttlSeconds Expiration timeframe in seconds (default is 5 minutes / 300s)
 * @returns Fully qualified secure embed URL
 */
export function generateSignedEmbedUrl(videoId: string, ttlSeconds: number = 300): string {
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
  const token = crypto
    .createHash('sha256')
    .update(message)
    .digest('hex');

  // Base embed URL player.mediadelivery.net/embed/{libraryId}/{videoId}
  return `https://player.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}`;
}
