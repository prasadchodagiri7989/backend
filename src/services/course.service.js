'use strict';

const Course         = require('../models/Course');
const progressService = require('./progress.service');

const sortModulesByBatch = (modules, moduleIdsOrder) => {
  if (!moduleIdsOrder || moduleIdsOrder.length === 0) return modules;
  const orderMap = {};
  moduleIdsOrder.forEach((id, idx) => {
    orderMap[id.toString()] = idx;
  });
  return [...modules].sort((a, b) => {
    const aId = a._id ? a._id.toString() : (a.id ? a.id.toString() : '');
    const bId = b._id ? b._id.toString() : (b.id ? b.id.toString() : '');
    const aIdx = orderMap[aId] !== undefined ? orderMap[aId] : 9999;
    const bIdx = orderMap[bId] !== undefined ? orderMap[bId] : 9999;
    return aIdx - bIdx;
  });
};

const findAll = (filter = {}) => Course.find(filter).sort({ createdAt: 1 });

const findById = (id) => Course.findById(id);

/**
 * Returns all courses with per-user progress merged in.
 * - course.progress  → % of topics the user has completed
 * - topic.completed  → true if this user has completed that topic
 */
const findAllWithProgress = async (userId, isPending = false) => {
  let filter = {};
  let userBatches = [];
  if (isPending) {
    filter = { isSample: true };
  } else {
    const Batch = require('../models/Batch');
    userBatches = await Batch.find({ members: userId }).lean();
    const batchIds = userBatches.map((b) => b._id);
    filter = { batches: { $in: batchIds } };
  }

  const [courses, completedMap] = await Promise.all([
    findAll(filter),
    progressService.findAllByUser(userId),
  ]);

  return courses.map((course) => {
    const courseObj  = course.toJSON();
    const courseId   = course._id.toString();
    
    // Sort modules if a batch has custom order
    if (!isPending && userBatches.length > 0) {
      const batchWithOrder = userBatches.find(
        (b) => b.moduleOrder && b.moduleOrder.some((mo) => mo.courseId.toString() === courseId)
      );
      if (batchWithOrder) {
        const orderObj = batchWithOrder.moduleOrder.find((mo) => mo.courseId.toString() === courseId);
        courseObj.modules = sortModulesByBatch(courseObj.modules, orderObj.moduleIds);
      }
    }

    const completed  = completedMap[courseId] || [];
    const allTopics  = courseObj.modules.flatMap((m) => m.topics);
    const totalTopics = allTopics.length;

    // Stamp completed flag per topic
    courseObj.modules = courseObj.modules.map((mod) => ({
      ...mod,
      topics: mod.topics.map((t) => ({
        ...t,
        completed: completed.includes(t.id),
      })),
    }));

    courseObj.progress = totalTopics > 0
      ? Math.round((completed.length / totalTopics) * 100)
      : 0;

    return courseObj;
  });
};

/**
 * Returns a single course with per-user progress merged in.
 */
const findByIdWithProgress = async (courseId, userId, isPending = false) => {
  const [course, completedTopics] = await Promise.all([
    findById(courseId),
    progressService.findByCourseAndUser(userId, courseId),
  ]);

  if (!course) return null;
  if (isPending && !course.isSample) return null;

  const courseObj  = course.toJSON();

  // Sort modules if a batch has custom order
  if (!isPending) {
    const Batch = require('../models/Batch');
    const userBatch = await Batch.findOne({ members: userId, courses: courseId }).lean();
    if (userBatch && userBatch.moduleOrder) {
      const orderObj = userBatch.moduleOrder.find((mo) => mo.courseId.toString() === courseId);
      if (orderObj) {
        courseObj.modules = sortModulesByBatch(courseObj.modules, orderObj.moduleIds);
      }
    }
  }

  const allTopics  = courseObj.modules.flatMap((m) => m.topics);
  const totalTopics = allTopics.length;

  courseObj.modules = courseObj.modules.map((mod) => ({
    ...mod,
    topics: mod.topics.map((t) => ({
      ...t,
      completed: completedTopics.includes(t.id),
    })),
  }));

  courseObj.progress = totalTopics > 0
    ? Math.round((completedTopics.length / totalTopics) * 100)
    : 0;

  return courseObj;
};

module.exports = { findAll, findById, findAllWithProgress, findByIdWithProgress };
