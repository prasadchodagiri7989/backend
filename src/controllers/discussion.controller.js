'use strict';

const Discussion = require('../models/Discussion');
const Course     = require('../models/Course');

/**
 * GET /api/discussions
 * Returns discussions.
 * Query:
 *  - topicId (optional): filter by topic/lesson. If provided, returns all discussions for this topic, sorted by date.
 *  - If topicId is omitted, only Admins are allowed to fetch all discussions (for the admin panel).
 */
const getDiscussions = async (req, res, next) => {
  try {
    const { topicId } = req.query;

    if (topicId) {
      const list = await Discussion.find({ topicId })
        .populate('userId', 'name email role avatar')
        .sort({ createdAt: 1 })
        .lean();
      
      const mappedList = list.map((d) => ({
        ...d,
        id: d._id.toString(),
        parentId: d.parentId ? d.parentId.toString() : null,
      }));
      return res.json(mappedList);
    }

    // Omitted topicId: Admin-only overview
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. topicId is required' });
    }

    const allDiscussions = await Discussion.find()
      .populate('userId', 'name email role avatar')
      .populate('courseId', 'title')
      .sort({ createdAt: -1 })
      .lean();

    // Map topicId to topic titles by fetching all courses
    const courses = await Course.find({}, 'title modules').lean();
    const topicMap = {};
    for (const c of courses) {
      for (const m of c.modules) {
        for (const t of m.topics) {
          topicMap[t._id.toString()] = {
            courseTitle: c.title,
            courseId: c._id.toString(),
            topicTitle: t.title,
          };
        }
      }
    }

    const enriched = allDiscussions.map((d) => {
      const lookup = topicMap[d.topicId] || {};
      const actualCourseId = d.courseId ? (d.courseId._id || d.courseId).toString() : null;
      return {
        ...d,
        id: d._id.toString(),
        parentId: d.parentId ? d.parentId.toString() : null,
        courseId: actualCourseId,
        courseTitle: lookup.courseTitle || (d.courseId ? d.courseId.title : 'Unknown Course'),
        topicTitle: lookup.topicTitle || 'Unknown Lesson',
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/discussions
 * Body: { courseId, topicId, content, parentId, attachment: { name, file } }
 * 'file' is base64 string
 */
const createDiscussion = async (req, res, next) => {
  try {
    const { courseId, topicId, content, parentId, attachment } = req.body;
    if (!courseId || !topicId || !content) {
      return res.status(400).json({ error: 'courseId, topicId, and content are required' });
    }

    let uploadedAttachment = undefined;
    if (attachment && attachment.file) {
      const fs = require('fs');
      const path = require('path');
      const { name, file } = attachment;

      // Identify mime type and file extension
      const matches = file.match(/^data:([^;]+);base64,/);
      let base64Data = file;
      let extension = 'pdf'; // default fallback
      if (matches) {
        base64Data = file.replace(/^data:[^;]+;base64,/, "");
        const mimeType = matches[1];
        if (mimeType.includes('pdf')) {
          extension = 'pdf';
        } else if (mimeType.includes('png')) {
          extension = 'png';
        } else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
          extension = 'jpg';
        } else if (mimeType.includes('word') || mimeType.includes('officedocument.wordprocessingml')) {
          extension = 'docx';
        } else if (mimeType.includes('excel') || mimeType.includes('officedocument.spreadsheetml')) {
          extension = 'xlsx';
        } else if (mimeType.includes('zip')) {
          extension = 'zip';
        } else if (mimeType.includes('text')) {
          extension = 'txt';
        } else {
          const parts = mimeType.split('/');
          if (parts[1]) {
            extension = parts[1].split('+')[0];
          }
        }
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const cleanName = name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `disc_${Date.now()}_${cleanName}.${extension}`;
      const uploadDir = path.join(__dirname, '..', '..', 'public', 'attachments');
      const uploadPath = path.join(uploadDir, filename);

      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(uploadPath, buffer);

      uploadedAttachment = {
        name,
        url: `/public/attachments/${filename}`,
      };
    }

    const discussion = await Discussion.create({
      courseId,
      topicId,
      userId: req.user.sub,
      content,
      parentId: parentId || null,
      attachment: uploadedAttachment,
    });

    const populated = await Discussion.findById(discussion._id)
      .populate('userId', 'name email role avatar')
      .lean();

    const mapped = {
      ...populated,
      id: populated._id.toString(),
      parentId: populated.parentId ? populated.parentId.toString() : null,
      courseId: populated.courseId ? populated.courseId.toString() : null,
    };

    res.status(201).json(mapped);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/discussions/:id
 * Admin only or check user matches userId (user requested: "admin can reply or delete any chats there").
 * Since we want only admin to delete, or admin + author, let's enforce admin-only delete.
 */
const deleteDiscussion = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can delete discussion posts' });
    }

    const fs = require('fs');
    const path = require('path');

    // Find discussion and its direct replies to delete files
    const targetAndReplies = await Discussion.find({
      $or: [
        { _id: id },
        { parentId: id }
      ]
    }).lean();

    for (const d of targetAndReplies) {
      if (d.attachment && d.attachment.url) {
        const filePath = path.join(__dirname, '..', '..', d.attachment.url);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            console.error(`Failed to delete file: ${filePath}`, e);
          }
        }
      }
    }

    await Discussion.deleteMany({
      $or: [
        { _id: id },
        { parentId: id }
      ]
    });

    res.json({ message: 'Discussion thread and replies deleted successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/discussions/replies-activity
 * Returns a list of replies (createdAt, topicId) made by other users to the logged in user's root posts.
 */
const getRepliesActivity = async (req, res, next) => {
  try {
    // Find all root posts by the logged in user
    const userRoots = await Discussion.find({
      userId: req.user.sub,
      parentId: null
    }).select('_id').lean();

    if (userRoots.length === 0) {
      return res.json([]);
    }

    const rootIds = userRoots.map(r => r._id);

    // Find all replies to those posts written by other users
    const replies = await Discussion.find({
      parentId: { $in: rootIds },
      userId: { $ne: req.user.sub }
    })
      .select('topicId createdAt')
      .lean();

    // Map safely
    const formatted = replies.map(r => ({
      id: r._id.toString(),
      topicId: r.topicId,
      createdAt: r.createdAt
    }));

    res.json(formatted);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDiscussions,
  createDiscussion,
  deleteDiscussion,
  getRepliesActivity,
};
