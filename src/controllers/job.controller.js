'use strict';

const Job = require('../models/Job');

/**
 * Get active published jobs for students with filters and pagination
 */
exports.getJobs = async (req, res) => {
  try {
    const {
      search = '',
      location = '',
      is_remote,
      job_type = '',
      site = '',
      date_range = '',
      page = 1,
      limit = 20,
      sortBy = 'newest',
    } = req.query;

    const query = { status: 'active' };

    // Search keyword in title, company, location, skills
    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: regex },
        { company: regex },
        { location: regex },
        { skills: regex },
      ];
    }

    // Specific location filter
    if (location.trim()) {
      query.location = new RegExp(location.trim(), 'i');
    }

    // Remote filter
    if (is_remote === 'true' || is_remote === true) {
      query.is_remote = true;
    }

    // Job type filter
    if (job_type && job_type !== 'all') {
      query.job_type = new RegExp(job_type, 'i');
    }

    // Site / Platform filter
    if (site && site !== 'all') {
      query.site = new RegExp(site, 'i');
    }

    // Date range filter
    if (date_range && date_range !== 'all') {
      const now = new Date();
      let threshold = null;

      if (date_range === '24h') {
        threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (date_range === '3d') {
        threshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      } else if (date_range === '7d') {
        threshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (date_range === '30d') {
        threshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      if (threshold) {
        query.createdAt = { $gte: threshold };
      }
    }

    // Sorting
    const sort = {};
    if (sortBy === 'oldest') {
      sort.createdAt = 1;
    } else {
      sort.createdAt = -1;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [jobs, total] = await Promise.all([
      Job.find(query).sort(sort).skip(skip).limit(limitNum),
      Job.countDocuments(query),
    ]);

    return res.json({
      jobs,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error('Fetch student jobs error:', err);
    return res.status(500).json({ error: 'Failed to fetch job opportunities' });
  }
};

/**
 * Get single job detail by ID
 */
exports.getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findOne({ _id: id, status: 'active' });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.json({ job });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
