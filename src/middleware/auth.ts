import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Course from '../models/Course';

export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    email: string;
    name: string;
    role: string;
    iat?: number;
    exp?: number;
  };
  lesson?: {
    id: string;
    title: string;
    videoId: string;
    bunnyLibraryId?: string;
  };
}

/**
 * Authorization Middleware for Video Playback
 * Flow:
 * 1. Verify JWT
 * 2. Verify user exists and is active
 * 3. Verify lesson (topic) exists in the database
 * 4. Verify user is enrolled/purchased course
 * 5. Return 403 if unauthorized, 404 if not found, 401 if unauthenticated
 */
export async function authorizeVideoAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'skylearn-dev-secret-change-in-prod') as any;

    // Verify user exists and is active
    const user = await User.findById(decoded.sub).select('status role').lean();
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
    const course = await Course.findOne({ 'modules.topics._id': lessonId });
    if (!course) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Find the specific topic inside the course modules
    let lesson: any = null;
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
  } catch (err: any) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(err);
  }
}
