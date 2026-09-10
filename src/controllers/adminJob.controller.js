'use strict';

const Job = require('../models/Job');
const JobSearch = require('../models/JobSearch');
const scraperService = require('../services/jobScraper.service');

/**
 * Utility to convert array of objects into CSV text
 */
function toCSV(data, columns) {
  if (!data || !data.length) return '';
  const headers = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
  const rows = data.map((item) =>
    columns
      .map((c) => {
        let val = typeof c.key === 'function' ? c.key(item) : item[c.key];
        if (val === undefined || val === null) val = '';
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      })
      .join(',')
  );
  return [headers, ...rows].join('\r\n');
}

/**
 * Check scraper service health
 */
exports.checkHealth = async (_req, res) => {
  try {
    const health = await scraperService.checkHealth();
    return res.json(health);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Run scraper for given term, location, sites
 */
exports.scrapeJobs = async (req, res) => {
  try {
    const {
      search_term,
      location = '',
      sites = ['indeed', 'linkedin', 'naukri'],
      results_wanted = 15,
      hours_old = 72,
      country_indeed = 'India',
      is_remote = false,
    } = req.body;

    if (!search_term) {
      return res.status(400).json({ error: 'Search term is required' });
    }

    const scrapeResult = await scraperService.scrapeJobs({
      search_term,
      location,
      sites,
      results_wanted,
      hours_old,
      country_indeed,
      is_remote,
    });

    const scrapedJobs = scrapeResult.jobs || [];

    // Check which of these jobs are already published in MongoDB
    const jobUrls = scrapedJobs.map((j) => j.job_url).filter(Boolean);
    const existingPublished = await Job.find({ job_url: { $in: jobUrls } }).select('job_url status');
    const publishedUrlMap = new Map(existingPublished.map((j) => [j.job_url, j.status]));

    const jobsWithStatus = scrapedJobs.map((job) => ({
      ...job,
      is_published: publishedUrlMap.has(job.job_url),
      published_status: publishedUrlMap.get(job.job_url) || null,
    }));

    // Cache search log in MongoDB
    try {
      await JobSearch.create({
        searchTerm: search_term,
        location,
        sites: Array.isArray(sites) ? sites : [sites],
        filters: { results_wanted, hours_old, country_indeed, is_remote },
        resultsCount: scrapedJobs.length,
        searchId: String(scrapeResult.search_id || ''),
        csvFileId: scrapeResult.files?.csv_file_id || null,
        performedBy: req.user?._id || null,
      });
    } catch (e) {
      console.warn('Could not cache search log in MongoDB:', e.message);
    }

    return res.json({
      message: 'Scraping completed',
      search_id: scrapeResult.search_id,
      count: scrapedJobs.length,
      files: scrapeResult.files,
      jobs: jobsWithStatus,
    });
  } catch (err) {
    console.error('Admin scrape error:', err);
    return res.status(500).json({ error: err.message || 'Scraping failed' });
  }
};

/**
 * Get previous search history
 */
exports.getSearchHistory = async (_req, res) => {
  try {
    // 1. Searches from MongoDB
    const mongoSearches = await JobSearch.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('performedBy', 'name email');

    // 2. Fallback or merge with Python sqlite history
    const pythonHistory = await scraperService.getSearchHistory();

    return res.json({
      mongo_searches: mongoSearches,
      python_searches: pythonHistory.searches || [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Get jobs from a specific previous search
 */
exports.getSearchJobs = async (req, res) => {
  try {
    const { searchId } = req.params;
    const data = await scraperService.getSearchJobs(searchId);
    const jobs = data.jobs || [];

    // Annotate published status
    const jobUrls = jobs.map((j) => j.job_url).filter(Boolean);
    const existingPublished = await Job.find({ job_url: { $in: jobUrls } }).select('job_url status');
    const publishedUrlMap = new Map(existingPublished.map((j) => [j.job_url, j.status]));

    const annotated = jobs.map((job) => ({
      ...job,
      is_published: publishedUrlMap.has(job.job_url),
      published_status: publishedUrlMap.get(job.job_url) || null,
    }));

    return res.json({ search_id: searchId, jobs: annotated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Push selected scraped jobs to MongoDB (published for students)
 */
exports.publishJobs = async (req, res) => {
  try {
    const { jobs } = req.body;
    if (!Array.isArray(jobs) || !jobs.length) {
      return res.status(400).json({ error: 'No jobs provided to publish' });
    }

    let publishedCount = 0;
    let updatedCount = 0;

    for (const item of jobs) {
      if (!item.title || !item.company || !item.job_url) continue;

      const jobData = {
        title: item.title,
        company: item.company,
        location: item.location || '',
        site: item.site || 'other',
        job_type: item.job_type || 'fulltime',
        is_remote: Boolean(item.is_remote),
        salary: {
          min_amount: item.min_amount != null ? Number(item.min_amount) : null,
          max_amount: item.max_amount != null ? Number(item.max_amount) : null,
          currency: item.currency || '',
          interval: item.interval || '',
        },
        date_posted: item.date_posted || '',
        job_url: item.job_url,
        job_url_direct: item.job_url_direct || '',
        description: item.description || '',
        status: 'active',
        pushedBy: req.user?._id || null,
        searchId: item.search_id ? String(item.search_id) : null,
        rawJson: item.raw_json || item,
      };

      const existing = await Job.findOne({ job_url: item.job_url });
      if (existing) {
        Object.assign(existing, jobData);
        await existing.save();
        updatedCount++;
      } else {
        await Job.create(jobData);
        publishedCount++;
      }
    }

    return res.json({
      message: `Successfully processed jobs: ${publishedCount} newly published, ${updatedCount} updated`,
      publishedCount,
      updatedCount,
    });
  } catch (err) {
    console.error('Publish jobs error:', err);
    return res.status(500).json({ error: err.message || 'Failed to publish jobs' });
  }
};

/**
 * Get all published jobs (for admin table/management)
 */
exports.getPublishedJobs = async (req, res) => {
  try {
    const { search, site, status, page = 1, limit = 25 } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }
    if (site && site !== 'all') {
      query.site = site;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [jobs, total] = await Promise.all([
      Job.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Job.countDocuments(query),
    ]);

    return res.json({
      jobs,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Delete or unpublish a job
 */
exports.deletePublishedJob = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findByIdAndDelete(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json({ message: 'Job deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Export published jobs as CSV
 */
exports.exportPublishedCsv = async (req, res) => {
  try {
    const jobs = await Job.find({ status: 'active' }).sort({ createdAt: -1 });

    const columns = [
      { label: 'Title', key: 'title' },
      { label: 'Company', key: 'company' },
      { label: 'Location', key: 'location' },
      { label: 'Platform', key: 'site' },
      { label: 'Job Type', key: 'job_type' },
      { label: 'Remote', key: (j) => (j.is_remote ? 'Yes' : 'No') },
      { label: 'Min Salary', key: (j) => j.salary?.min_amount ?? '' },
      { label: 'Max Salary', key: (j) => j.salary?.max_amount ?? '' },
      { label: 'Currency', key: (j) => j.salary?.currency ?? '' },
      { label: 'Date Posted', key: 'date_posted' },
      { label: 'Apply URL', key: 'job_url' },
      { label: 'Direct URL', key: 'job_url_direct' },
      { label: 'Published Date', key: (j) => new Date(j.createdAt).toISOString() },
    ];

    const csvContent = toCSV(jobs, columns);
    const filename = `published_jobs_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Export scraped jobs for a specific search ID or JSON body as CSV
 */
exports.exportScrapedCsv = async (req, res) => {
  try {
    const { searchId } = req.params;
    let jobs = [];

    if (searchId) {
      const data = await scraperService.getSearchJobs(searchId);
      jobs = data.jobs || [];
    } else if (Array.isArray(req.body.jobs)) {
      jobs = req.body.jobs;
    }

    const columns = [
      { label: 'Title', key: 'title' },
      { label: 'Company', key: 'company' },
      { label: 'Location', key: 'location' },
      { label: 'Site', key: 'site' },
      { label: 'Job Type', key: 'job_type' },
      { label: 'Is Remote', key: (j) => (j.is_remote ? 'Yes' : 'No') },
      { label: 'Min Salary', key: 'min_amount' },
      { label: 'Max Salary', key: 'max_amount' },
      { label: 'Currency', key: 'currency' },
      { label: 'Date Posted', key: 'date_posted' },
      { label: 'Job URL', key: 'job_url' },
      { label: 'Direct URL', key: 'job_url_direct' },
    ];

    const csvContent = toCSV(jobs, columns);
    const filename = `scraped_jobs_${searchId || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
