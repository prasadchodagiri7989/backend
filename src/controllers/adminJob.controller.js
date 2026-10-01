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
      include_title_in_description = true,
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
      include_title_in_description,
    });

    const scrapedJobs = scrapeResult.jobs || [];

    // Check which of these jobs are already published in MongoDB
    const jobUrls = scrapedJobs.map((j) => j.job_url).filter(Boolean);
    const existingPublished = await Job.find({ job_url: { $in: jobUrls } }).select('job_url status');
    const publishedUrlMap = new Map(existingPublished.map((j) => [j.job_url, j.status]));

    const jobsWithStatus = scrapedJobs.map((job) => {
      let desc = job.description || '';
      if (include_title_in_description && job.title) {
        const cleanTitle = String(job.title).trim();
        if (!desc.toLowerCase().startsWith(cleanTitle.toLowerCase()) && !desc.toLowerCase().includes(`job title: ${cleanTitle.toLowerCase()}`)) {
          desc = desc ? `Job Title: ${cleanTitle}\n\n${desc}` : `Job Title: ${cleanTitle}`;
        }
      }
      return {
        ...job,
        description: desc,
        is_published: publishedUrlMap.has(job.job_url),
        published_status: publishedUrlMap.get(job.job_url) || null,
      };
    });

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

const LOGO_COLORS = [
  { bg: '#d92d20', text: '#ffffff' },
  { bg: '#0f172a', text: '#ffffff' },
  { bg: '#1c1917', text: '#fde047' },
  { bg: '#0284c7', text: '#ffffff' },
  { bg: '#1e3a8a', text: '#ffffff' },
  { bg: '#0d9488', text: '#ffffff' },
  { bg: '#059669', text: '#ffffff' },
  { bg: '#4f46e5', text: '#ffffff' },
  { bg: '#18181b', text: '#38bdf8' },
];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toHTML(jobs, pageTitle = 'More jobs') {
  const cards = (jobs || []).map((j, idx) => {
    const title = escapeHtml(j.title || 'Job Opening');
    const comp = escapeHtml(j.company || 'Company');
    const loc = escapeHtml(j.location || (j.is_remote ? 'Remote' : 'India'));
    const url = escapeHtml(j.job_url || j.job_url_direct || '#');
    const site = (j.site || '').toLowerCase();
    const isEasyApply = site.includes('linkedin') || url.includes('linkedin.com');

    let hash = 0;
    for (let i = 0; i < comp.length; i++) hash = comp.charCodeAt(i) + ((hash << 5) - hash);
    const color = LOGO_COLORS[Math.abs(hash) % LOGO_COLORS.length];
    const words = comp.trim().split(/\s+/);
    const initials = words.length === 1 ? words[0].slice(0, 3).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase();

    const minSal = j.salary?.min_amount ?? j.min_amount;
    const maxSal = j.salary?.max_amount ?? j.max_amount;
    const curr = j.salary?.currency ?? j.currency ?? 'INR';
    const interval = j.salary?.interval ?? j.interval ?? 'yr';
    let salText = '';
    if (minSal && maxSal) salText = `${minSal >= 1000 ? Math.round(minSal/1000)+'K' : minSal} - ${maxSal >= 1000 ? Math.round(maxSal/1000)+'K' : maxSal} ${curr}/${interval}`;
    else if (minSal || maxSal) salText = `${(minSal || maxSal) >= 1000 ? Math.round((minSal || maxSal)/1000)+'K' : (minSal || maxSal)} ${curr}/${interval}`;

    const connCount = ((idx * 73 + 18) % 350) + 8;
    const showConn = idx % 2 === 0;

    return `
      <article class="job-card" data-title="${title.toLowerCase()}" data-company="${comp.toLowerCase()}" data-location="${loc.toLowerCase()}">
        <div class="card-header">
          <div class="company-logo" style="background-color: ${color.bg}; color: ${color.text};">${initials}</div>
        </div>
        <div class="card-body">
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="job-title-link">
            <h2 class="job-title">
              ${title}
              <svg class="verified-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
            </h2>
          </a>
          <p class="company-name">${comp}</p>
          <p class="job-location">${loc}</p>
          ${salText ? `<p class="job-salary">${escapeHtml(salText)}</p>` : ''}
          <div class="badges-row">
            ${showConn ? `
              <div class="connections-badge">
                <div class="avatar-stack">
                  <span class="mini-avatar" style="background:#3b82f6;"></span>
                  <span class="mini-avatar" style="background:#ec4899;"></span>
                  <span class="mini-avatar" style="background:#eab308;"></span>
                </div>
                <span>${connCount} connections work here</span>
              </div>
            ` : `
              <div class="active-badge">
                <svg class="active-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span>Actively reviewing applicants</span>
              </div>
            `}
          </div>
        </div>
        <div class="card-footer">
          <span class="posted-status">Promoted · 1 week ago</span>
          ${isEasyApply ? `
            <div class="easy-apply-badge"><span class="in-icon">in</span><span>Easy Apply</span></div>
          ` : ''}
        </div>
      </article>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f3f4f6; color: #1e293b; padding: 32px 16px 64px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header-bar { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
    @media (min-width: 640px) { .header-bar { flex-direction: row; align-items: center; justify-content: space-between; } }
    .page-heading { font-size: 22px; font-weight: 700; color: #0f172a; }
    .search-filter-box { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 420px; }
    .search-input { width: 100%; padding: 10px 14px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; }
    .search-input:focus { border-color: #0a66c2; box-shadow: 0 0 0 3px rgba(10,102,194,0.15); }
    .jobs-count { font-size: 13px; font-weight: 600; color: #64748b; white-space: nowrap; }
    .jobs-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
    @media (min-width: 640px) { .jobs-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1024px) { .jobs-grid { grid-template-columns: repeat(3, 1fr); } }
    .job-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(15,23,42,0.04); transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .job-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(15,23,42,0.08); border-color: #cbd5e1; }
    .card-header { margin-bottom: 14px; }
    .company-logo { width: 46px; height: 46px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
    .card-body { flex: 1; display: flex; flex-direction: column; }
    .job-title-link { text-decoration: none; margin-bottom: 4px; }
    .job-title { font-size: 15.5px; font-weight: 700; color: #0a66c2; line-height: 1.35; display: inline-flex; align-items: center; gap: 6px; }
    .job-title-link:hover .job-title { color: #004182; text-decoration: underline; }
    .verified-icon { width: 14px; height: 14px; color: #475569; }
    .company-name { font-size: 13.5px; font-weight: 500; color: #334155; margin-bottom: 2px; }
    .job-location { font-size: 13px; color: #64748b; margin-bottom: 6px; }
    .job-salary { font-size: 12.5px; font-weight: 600; color: #1e293b; margin-bottom: 6px; }
    .badges-row { margin: 6px 0 12px; min-height: 24px; }
    .active-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 500; color: #057642; }
    .active-icon { width: 15px; height: 15px; color: #057642; }
    .connections-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; }
    .avatar-stack { display: flex; align-items: center; }
    .mini-avatar { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid #fff; margin-left: -5px; }
    .mini-avatar:first-child { margin-left: 0; }
    .card-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 12px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b; }
    .easy-apply-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; color: #0a66c2; }
    .in-icon { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; background: #0a66c2; color: #fff; border-radius: 2px; font-size: 9px; font-weight: 800; }
    .no-results { grid-column: 1 / -1; text-align: center; padding: 48px 16px; color: #64748b; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar">
      <h1 class="page-heading">${escapeHtml(pageTitle)}</h1>
      <div class="search-filter-box">
        <input type="text" id="search-input" class="search-input" placeholder="Filter by title, company, or location..." />
        <span id="jobs-count" class="jobs-count">${(jobs || []).length} jobs</span>
      </div>
    </div>
    <div id="jobs-grid" class="jobs-grid">
      ${cards}
      <div id="no-results" class="no-results">No jobs matched your filter.</div>
    </div>
  </div>
  <script>
    const input = document.getElementById('search-input');
    const countEl = document.getElementById('jobs-count');
    const cards = Array.from(document.querySelectorAll('.job-card'));
    const noResults = document.getElementById('no-results');
    const total = cards.length;
    if (input && countEl) {
      input.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        let count = 0;
        cards.forEach(card => {
          const t = card.getAttribute('data-title') || '';
          const c = card.getAttribute('data-company') || '';
          const l = card.getAttribute('data-location') || '';
          const match = !q || t.includes(q) || c.includes(q) || l.includes(q);
          card.style.display = match ? 'flex' : 'none';
          if (match) count++;
        });
        countEl.textContent = q ? (count + ' of ' + total + ' jobs') : (total + ' jobs');
        if (noResults) noResults.style.display = count === 0 ? 'block' : 'none';
      });
    }
  </script>
</body>
</html>`;
}

/**
 * Export published jobs as responsive HTML
 */
exports.exportPublishedHtml = async (req, res) => {
  try {
    const jobs = await Job.find({ status: 'active' }).sort({ createdAt: -1 });
    const htmlContent = toHTML(jobs, 'More jobs');
    const filename = `published_jobs_${new Date().toISOString().slice(0, 10)}.html`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(htmlContent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Export scraped jobs as responsive HTML
 */
exports.exportScrapedHtml = async (req, res) => {
  try {
    const { searchId } = req.params;
    let jobs = [];

    if (searchId) {
      const data = await scraperService.getSearchJobs(searchId);
      jobs = data.jobs || [];
    } else if (Array.isArray(req.body.jobs)) {
      jobs = req.body.jobs;
    }

    const htmlContent = toHTML(jobs, 'More jobs');
    const filename = `scraped_jobs_${searchId || 'export'}_${new Date().toISOString().slice(0, 10)}.html`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(htmlContent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
