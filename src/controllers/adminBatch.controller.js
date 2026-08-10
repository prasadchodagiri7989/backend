'use strict';

const Batch = require('../models/Batch');
const Course = require('../models/Course');
const User = require('../models/User');

const formatBatch = (b) => ({
  id: b._id.toString(),
  name: b.name,
  description: b.description || '',
  members: (b.members || []).map(m => {
    if (m && typeof m === 'object' && m._id) {
      return {
        id: m._id.toString(),
        name: m.name,
        email: m.email,
        status: m.status,
      };
    }
    return m;
  }),
  courses: (b.courses || []).map(c => {
    if (c && typeof c === 'object' && c._id) {
      return {
        id: c._id.toString(),
        title: c.title,
        description: c.description || '',
      };
    }
    return c;
  }),
  moduleOrder: b.moduleOrder || [],
});

const getBatches = async (req, res, next) => {
  try {
    const batches = await Batch.find()
      .populate('members', 'name email status')
      .populate('courses', 'title description')
      .lean();
    res.json(batches.map(formatBatch));
  } catch (err) {
    next(err);
  }
};

const getBatchById = async (req, res, next) => {
  try {
    const batch = await Batch.findById(req.params.id)
      .populate('members', 'name email status')
      .populate('courses', 'title description')
      .lean();
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json(formatBatch(batch));
  } catch (err) {
    next(err);
  }
};

const createBatch = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const batch = await Batch.create({ name, description: description || '' });
    res.status(201).json(batch);
  } catch (err) {
    next(err);
  }
};

const updateBatch = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    const batch = await Batch.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json(batch);
  } catch (err) {
    next(err);
  }
};

const deleteBatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const batch = await Batch.findByIdAndDelete(id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    // Pull this batch ID from all Course documents
    await Course.updateMany({ batches: id }, { $pull: { batches: id } });

    res.json({ message: 'Batch deleted successfully' });
  } catch (err) {
    next(err);
  }
};

const addMember = async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const batch = await Batch.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    if (!batch.members.includes(userId)) {
      batch.members.push(userId);
      await batch.save();
    }
    const updated = await Batch.findById(req.params.id)
      .populate('members', 'name email status')
      .populate('courses', 'title description')
      .lean();
    res.json(formatBatch(updated));
  } catch (err) {
    next(err);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const batch = await Batch.findById(id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    batch.members = batch.members.filter(m => m.toString() !== userId);
    await batch.save();

    const updated = await Batch.findById(id)
      .populate('members', 'name email status')
      .populate('courses', 'title description')
      .lean();
    res.json(formatBatch(updated));
  } catch (err) {
    next(err);
  }
};

const alignCourses = async (req, res, next) => {
  try {
    const { courseIds } = req.body;
    if (!Array.isArray(courseIds)) return res.status(400).json({ error: 'courseIds array is required' });

    const batch = await Batch.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    // 1. Remove this batch ID from courses that are no longer assigned
    await Course.updateMany(
      { batches: batch._id, _id: { $nin: courseIds } },
      { $pull: { batches: batch._id } }
    );

    // 2. Add this batch ID to courses that are newly assigned
    await Course.updateMany(
      { _id: { $in: courseIds } },
      { $addToSet: { batches: batch._id } }
    );

    // 3. Update Batch document
    batch.courses = courseIds;
    await batch.save();

    const updated = await Batch.findById(req.params.id)
      .populate('members', 'name email status')
      .populate('courses', 'title description')
      .lean();
    res.json(formatBatch(updated));
  } catch (err) {
    next(err);
  }
};

// Sync helper for Course updates
const syncCourseBatches = async (courseId, batchIds) => {
  // Remove courseId from all Batch documents where batch._id is NOT in batchIds
  await Batch.updateMany(
    { courses: courseId, _id: { $nin: batchIds } },
    { $pull: { courses: courseId } }
  );

  // Add courseId to all Batch documents where batch._id is in batchIds
  await Batch.updateMany(
    { _id: { $in: batchIds } },
    { $addToSet: { courses: courseId } }
  );
};

const reorderBatchModules = async (req, res, next) => {
  try {
    const { id, courseId } = req.params;
    const { moduleIds } = req.body;
    if (!Array.isArray(moduleIds)) {
      return res.status(400).json({ error: 'moduleIds array is required' });
    }

    const batch = await Batch.findById(id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    if (!batch.moduleOrder) {
      batch.moduleOrder = [];
    }
    batch.moduleOrder = batch.moduleOrder.filter(mo => mo.courseId.toString() !== courseId);
    
    batch.moduleOrder.push({
      courseId,
      moduleIds
    });

    await batch.save();

    const updated = await Batch.findById(id)
      .populate('members', 'name email status')
      .populate('courses', 'title description')
      .lean();
    res.json(formatBatch(updated));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBatches,
  getBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
  addMember,
  removeMember,
  alignCourses,
  syncCourseBatches,
  reorderBatchModules,
};
