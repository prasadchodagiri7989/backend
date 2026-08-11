import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { generateSignedEmbedUrl } from '../services/bunny.service';

/**
 * Controller to fetch a secure, signed Bunny Stream embed URL.
 * Binds expiration to 5 minutes.
 */
export async function getVideoSignedUrl(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.lesson || !req.lesson.videoId) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Generate URL with 5 minute expiration (300 seconds)
    const signedUrl = generateSignedEmbedUrl(req.lesson.videoId, req.lesson.bunnyLibraryId || '', 300);

    return res.json({ url: signedUrl });
  } catch (err) {
    next(err);
  }
}
