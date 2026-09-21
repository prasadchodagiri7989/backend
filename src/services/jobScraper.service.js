'use strict';

const JOBSCRAPPER_URL = process.env.JOBSCRAPPER_URL || 'http://127.0.0.1:5005';
const INTERNAL_SECRET = process.env.JOBSCRAPPER_INTERNAL_SECRET || 'skylearn-job-scraper-internal-key';

class JobScraperService {
  /**
   * Health check to see if python scraper service is running
   */
  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${JOBSCRAPPER_URL}/api/internal/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return { running: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { running: true, ...data };
    } catch (err) {
      return { running: false, error: err.message };
    }
  }

  /**
   * Trigger scraping through Python service
   */
  async scrapeJobs({
    search_term,
    location = '',
    sites = ['indeed', 'linkedin', 'naukri'],
    results_wanted = 15,
    hours_old = 72,
    country_indeed = 'India',
    is_remote = false,
  }) {
    const controller = new AbortController();
    // Scraping across multiple platforms can take up to 5 minutes
    const timeout = setTimeout(() => controller.abort(), 300000);

    try {
      const res = await fetch(`${JOBSCRAPPER_URL}/api/internal/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
        body: JSON.stringify({
          search_term,
          location,
          sites,
          results_wanted: Number(results_wanted) || 15,
          hours_old: hours_old ? Number(hours_old) : null,
          country_indeed,
          is_remote: Boolean(is_remote),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.details || `Scraper returned status ${res.status}`);
      }

      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Scraping request timed out after 120 seconds. Please try reducing the number of sites or results.');
      }
      if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
        throw new Error('Job Scraper Python service is offline on port 5005. Please start it using python app.py.');
      }
      throw err;
    }
  }

  /**
   * Fetch previous search runs from Python service
   */
  async getSearchHistory() {
    try {
      const res = await fetch(`${JOBSCRAPPER_URL}/api/internal/history`, {
        headers: {
          'x-internal-secret': INTERNAL_SECRET,
        },
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Could not fetch scraper search history from Python service:', err.message);
      return { searches: [], files: [] };
    }
  }

  /**
   * Fetch jobs for a specific search from Python service
   */
  async getSearchJobs(searchId) {
    try {
      const res = await fetch(`${JOBSCRAPPER_URL}/api/internal/history/jobs/${searchId}`, {
        headers: {
          'x-internal-secret': INTERNAL_SECRET,
        },
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Could not fetch jobs for search ${searchId}:`, err.message);
      return { search_id: searchId, jobs: [] };
    }
  }

  /**
   * Download exported file from Python service
   */
  async getExportFile(fileId) {
    const res = await fetch(`${JOBSCRAPPER_URL}/api/internal/files/${fileId}`, {
      headers: {
        'x-internal-secret': INTERNAL_SECRET,
      },
    });
    if (!res.ok) throw new Error(`File download failed: status ${res.status}`);
    return res;
  }
}

module.exports = new JobScraperService();
