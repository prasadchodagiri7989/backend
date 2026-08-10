'use strict';

const courseService = require('../services/course.service');

const getAll = async (req, res, next) => {
  try {
    const isPending = req.user && req.user.status === 'pending';
    const courses = req.user
      ? await courseService.findAllWithProgress(req.user.sub, isPending)
      : await courseService.findAll();
    res.json(courses);
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const isPending = req.user && req.user.status === 'pending';
    const course = req.user
      ? await courseService.findByIdWithProgress(req.params.id, req.user.sub, isPending)
      : await courseService.findById(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json(course);
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getById };
